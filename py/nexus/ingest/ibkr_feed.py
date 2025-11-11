"""
IBKR Feed Adapter using ib_insync
Connects to IB Gateway and writes market data to EventLog (Parquet)
"""

import sys
import time
import signal
from datetime import datetime
from pathlib import Path
from typing import Dict, Set
import logging

try:
    from ib_insync import IB, Stock, util
except ImportError:
    print("ERROR: ib_insync not installed. Install with: pip install ib_insync")
    sys.exit(1)

try:
    from nexus.ingest.venue_timezones import localize_event_time
except ImportError:
    print("ERROR: venue_timezones module not found")
    sys.exit(1)

try:
    from prometheus_client import Counter, Histogram, Gauge, start_http_server
except ImportError:
    print("WARNING: prometheus_client not installed. Metrics disabled.")
    print("Install with: pip install prometheus-client")
    Counter = Histogram = Gauge = None
    start_http_server = None

# Import C++ EventLog bindings
_nexus_root = Path(__file__).parent.parent.parent.parent
_eventlog_py_path = _nexus_root / "build" / "cpp" / "eventlog"
if not _eventlog_py_path.exists():
    print(f"ERROR: EventLog Python bindings not found at {_eventlog_py_path}")
    print("Build first with: make build")
    sys.exit(1)

sys.path.insert(0, str(_eventlog_py_path))

try:
    import eventlog_py
except ImportError as e:
    print(f"ERROR: Failed to import eventlog_py: {e}")
    print(f"Searched in: {_eventlog_py_path}")
    print(f"Files: {list(_eventlog_py_path.glob('*.so'))}")
    sys.exit(1)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Prometheus metrics (optional, gracefully disabled if not installed)
if Counter:
    # Counters (with feed_mode label for live vs delayed separation)
    EVENTS_RECEIVED = Counter('nexus_events_received_total', 'Total events received from IBKR', ['symbol', 'feed_mode'])
    EVENTS_WRITTEN = Counter('nexus_events_written_total', 'Total events written to EventLog', ['symbol', 'feed_mode'])
    VALIDATION_ERRORS = Counter('nexus_validation_errors_total', 'Total validation errors', ['symbol', 'feed_mode'])
    CONNECTION_ERRORS = Counter('nexus_connection_errors_total', 'Total connection errors')
    RECONNECTS = Counter('nexus_reconnects_total', 'Total reconnection attempts')
    
    # Histograms (with feed_mode label)
    TICK_PROCESSING_DURATION = Histogram('nexus_tick_processing_seconds', 
                                         'Time to process a tick (receive to write)', ['symbol', 'feed_mode'])
    FLUSH_DURATION = Histogram('nexus_flush_duration_seconds',
                              'Time to flush EventLog writer', ['symbol', 'feed_mode'])
    NETWORK_LATENCY = Histogram('nexus_network_latency_seconds',
                               'Network latency (event time to receive time)', ['symbol', 'feed_mode'])
    
    # Gauges
    CONNECTED_STATUS = Gauge('nexus_connected', 'IB Gateway connection status (1=connected, 0=disconnected)')
    SUBSCRIBED_SYMBOLS = Gauge('nexus_subscribed_symbols', 'Number of subscribed symbols')
    WRITER_COUNT = Gauge('nexus_active_writers', 'Number of active writers')
    FEED_MODE = Gauge('nexus_feed_mode', 'Current feed mode (1=live, 3=delayed)')
    
    # Writer metrics (polled from C++ layer)
    WRITER_ROWS_WRITTEN = Gauge('nexus_writer_rows_written', 'Total rows written by EventLog writer', ['symbol'])
    WRITER_VALIDATION_ERRORS = Gauge('nexus_writer_validation_errors', 'Validation errors from EventLog writer', ['symbol'])
else:
    # Dummy implementations when prometheus unavailable
    class DummyMetric:
        def labels(self, *args, **kwargs): return self
        def inc(self, *args, **kwargs): pass
        def observe(self, *args, **kwargs): pass
        def set(self, *args, **kwargs): pass
        def time(self): 
            class DummyTimer:
                def __enter__(self): return self
                def __exit__(self, *args): pass
            return DummyTimer()
    
    EVENTS_RECEIVED = EVENTS_WRITTEN = VALIDATION_ERRORS = DummyMetric()
    CONNECTION_ERRORS = RECONNECTS = DummyMetric()
    TICK_PROCESSING_DURATION = FLUSH_DURATION = NETWORK_LATENCY = DummyMetric()
    CONNECTED_STATUS = SUBSCRIBED_SYMBOLS = WRITER_COUNT = DummyMetric()
    WRITER_ROWS_WRITTEN = WRITER_VALIDATION_ERRORS = DummyMetric()


class IBKRFeedAdapter:
    """IBKR Feed Adapter - Production-ready ingestion to EventLog"""
    
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 4001,  # From your screenshot
        client_id: int = 42,
        symbols: list[str] = None,
        parquet_dir: str = "./data/parquet"
    ):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.symbols = symbols or ["AAPL", "MSFT", "SPY", "QQQ", "TSLA"]
        self.parquet_dir = Path(parquet_dir)
        
        self.ib = IB()
        self.writers: Dict[str, any] = {}  # Symbol -> EventLog Writer
        self.contracts: Dict[str, Stock] = {}  # Symbol -> IB Contract
        self.subscribed_symbols: Set[str] = set()
        self.callbacks_registered: bool = False  # Track callback registration
        
        # Per-symbol sequence counters (monotonic within symbol)
        self.seq_counters: Dict[str, int] = {sym: 0 for sym in self.symbols}
        
        # Last flush time per symbol (for time-based flush)
        self.last_flush_time: Dict[str, float] = {}
        
        # Events since last flush per symbol (for precise flush accounting)
        self.events_since_flush: Dict[str, int] = {}
        
        # Current date for rollover detection
        self.current_date: str = ""
        
        # Market data mode (1=live, 3=delayed)
        self.market_data_type = 1  # Start with live, fallback to delayed if needed
        
        # Ingest session ID for provenance and de-duplication
        import uuid
        self.ingest_session_id = str(uuid.uuid4())
        logger.info(f"Ingest session ID: {self.ingest_session_id}")
        
        # Statistics
        self.stats = {
            "events_received": 0,
            "events_written": 0,
            "validation_errors": 0,
            "connection_errors": 0,
            "reconnects": 0,
            "last_event_ts": 0
        }
        
        self.running = False
        self.should_stop = False
        self.reconnect_attempts = 0
        self.base_reconnect_delay_sec = 5  # Base delay for exponential backoff
        self.max_reconnect_delay = 60  # Max 60 seconds between retries
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.should_stop = True
    
    def connect(self) -> bool:
        """Connect to IB Gateway"""
        try:
            logger.info(f"Connecting to IB Gateway at {self.host}:{self.port}...")
            self.ib.connect(self.host, self.port, clientId=self.client_id)
            logger.info("Connected to IB Gateway")
            
            # Request market data type
            # Type 1 = real-time, Type 3 = delayed (15-20 min), Type 4 = delayed frozen
            # Try live first; IB will send error 10089 if subscription not available
            try:
                self.ib.reqMarketDataType(self.market_data_type)
                logger.info(f"Requested market data type {self.market_data_type} "
                           f"({'live' if self.market_data_type == 1 else 'delayed'})")
            except Exception as e:
                logger.warning(f"Could not set market data type: {e}")
            
            self.reconnect_attempts = 0  # Reset on successful connect
            CONNECTED_STATUS.set(1)
            FEED_MODE.set(self.market_data_type)  # Set current feed mode gauge
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self.stats["connection_errors"] += 1
            CONNECTION_ERRORS.inc()
            CONNECTED_STATUS.set(0)
            self.reconnect_attempts += 1
            return False
    
    def subscribe_market_data(self) -> bool:
        """Subscribe to market data for configured symbols"""
        try:
            logger.info(f"Subscribing to {len(self.symbols)} symbols...")
            
            for symbol in self.symbols:
                # Skip if already subscribed (reconnect idempotency)
                if symbol in self.subscribed_symbols:
                    continue
                
                # Create contract (reuse if exists from previous connection)
                if symbol not in self.contracts:
                    contract = Stock(symbol, "SMART", "USD")
                    self.contracts[symbol] = contract
                
                # Request market data
                self.ib.reqMktData(self.contracts[symbol], "", False, False)
                self.subscribed_symbols.add(symbol)
                
                logger.info(f"  Subscribed to {symbol}")
            
            logger.info(f"Successfully subscribed to {len(self.symbols)} symbols")
            SUBSCRIBED_SYMBOLS.set(len(self.subscribed_symbols))
            return True
            
        except Exception as e:
            logger.error(f"Failed to subscribe: {e}")
            self.stats["connection_errors"] += 1
            CONNECTION_ERRORS.inc()
            return False
    
    def check_date_rollover(self):
        """Check if date has changed and close/reopen writers (UTC-based)"""
        from datetime import datetime, timezone
        current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        if self.current_date and self.current_date != current_date:
            logger.info(f"Date rollover detected: {self.current_date} -> {current_date}")
            logger.info("Closing all writers for date rollover...")
            
            for symbol, writer in self.writers.items():
                writer.close()
                logger.info(f"Closed writer for {symbol}")
            
            self.writers.clear()
            self.last_flush_time.clear()
            logger.info("Writers closed. New files will be created for new date.")
        
        self.current_date = current_date
    
    def check_flush_needed(self, symbol: str, events_since_flush: int) -> bool:
        """Check if flush is needed (time-based or count-based)"""
        now = time.time()
        
        # Count-based: flush every 2000 events
        if events_since_flush >= 2000:
            return True
        
        # Time-based: flush every 2 seconds
        last_flush = self.last_flush_time.get(symbol, 0)
        if now - last_flush >= 2.0:
            return True
        
        return False
    
    def get_writer(self, symbol: str):
        """Get or create EventLog writer for symbol"""
        if symbol not in self.writers:
            # Use Partitioner to get canonical path
            now_ns = time.time_ns()
            path = eventlog_py.Partitioner.get_path(str(self.parquet_dir), symbol, now_ns)
            
            logger.info(f"Creating writer for {symbol} at {path}")
            
            # Ensure directory exists
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            
            # Create writer
            writer = eventlog_py.Writer(path)
            
            # Set provenance metadata before first write
            writer.set_ingest_session_id(self.ingest_session_id)
            feed_mode = "live" if self.market_data_type == 1 else "delayed"
            writer.set_feed_mode(feed_mode)
            
            self.writers[symbol] = writer
            self.last_flush_time[symbol] = time.time()
            self.events_since_flush[symbol] = 0
            WRITER_COUNT.set(len(self.writers))
            
            logger.info(f"Writer metadata: session={self.ingest_session_id[:8]}..., mode={feed_mode}")
        
        return self.writers[symbol]
    
    def _rotate_writers_for_feed_mode_change(self, old_mode: int, new_mode: int):
        """
        Rotate all open writers when feed mode changes (live <-> delayed).
        Ensures feed_mode metadata accurately reflects the data source.
        """
        if not self.writers:
            return  # No writers to rotate
        
        mode_str = {1: "live", 3: "delayed"}
        logger.info(f"Feed mode changed {mode_str.get(old_mode, 'unknown')} → {mode_str.get(new_mode, 'unknown')}, "
                   f"rotating {len(self.writers)} writers")
        
        # Close all current writers (this finalizes files with old feed_mode)
        for symbol, writer in self.writers.items():
            try:
                writer.close()
                logger.debug(f"Closed writer for {symbol} (feed_mode={mode_str.get(old_mode, 'unknown')})")
            except Exception as e:
                logger.error(f"Error closing writer for {symbol}: {e}")
        
        # Clear writer cache so new writers will be created with correct feed_mode
        self.writers.clear()
        self.last_flush_time.clear()
        self.events_since_flush.clear()
        WRITER_COUNT.set(0)
        
        logger.info(f"Writers rotated successfully, new data will have feed_mode={mode_str.get(new_mode, 'unknown')}")
    
    def _get_event_timestamp_ns(self, ticker, fallback_ns: int) -> int:
        """
        Extract event timestamp from ticker with venue-aware timezone handling.
        
        Process:
        1. Get ticker.time datetime
        2. Determine venue from ticker.contract
        3. Use venue_timezones.localize_event_time() to handle:
           - Naive datetimes -> localize to exchange timezone -> UTC
           - Timezone-aware datetimes -> convert to UTC
           - DST transitions (with proper ambiguity handling)
        4. Fallback on any error
        
        Returns: Event timestamp in nanoseconds (UTC) or fallback
        """
        if not hasattr(ticker, 'time') or ticker.time is None:
            return fallback_ns
        
        try:
            # Get venue for timezone lookup
            venue = ticker.contract.exchange if hasattr(ticker.contract, 'exchange') else "SMART"
            if not venue:
                venue = "SMART"
            
            # Use venue timezone mapping (handles naive/aware, DST, validation)
            return localize_event_time(ticker.time, venue, fallback_ns)
        
        except Exception as e:
            # Any error -> use fallback
            logger.debug(f"Timestamp conversion error: {e}, using receive time")
            return fallback_ns
    
    def _infer_aggressor(self, price: float, bid: float, ask: float, midpoint: float):
        """
        Infer trade aggressor using price relative to bid/ask.
        
        Rules:
        1. If price >= ask: BUY (taker lifted the offer)
        2. If price <= bid: SELL (taker hit the bid)
        3. If bid < price < ask:
           - Closer to ask (> midpoint + tolerance): likely BUY
           - Closer to bid (< midpoint - tolerance): likely SELL
           - Otherwise: UNKNOWN (midpoint trade, ambiguous)
        4. If bid/ask unavailable: UNKNOWN
        """
        import math
        
        # Missing bid/ask data
        if not bid or not ask or not math.isfinite(bid) or not math.isfinite(ask):
            return eventlog_py.Aggressor.UNKNOWN
        
        # Sanity check: bid should be < ask
        if bid >= ask:
            return eventlog_py.Aggressor.UNKNOWN
        
        # Clear cases: at or through the quotes
        if price >= ask:
            return eventlog_py.Aggressor.BUY  # Lifted the offer
        if price <= bid:
            return eventlog_py.Aggressor.SELL  # Hit the bid
        
        # Price inside spread: use midpoint with small tolerance
        # Tolerance: 1/10 of spread or 1 basis point, whichever larger
        spread = ask - bid
        tolerance = max(spread * 0.1, price * 0.0001)
        
        if price > midpoint + tolerance:
            return eventlog_py.Aggressor.BUY  # Closer to ask
        elif price < midpoint - tolerance:
            return eventlog_py.Aggressor.SELL  # Closer to bid
        else:
            return eventlog_py.Aggressor.UNKNOWN  # Midpoint or ambiguous
    
    def handle_ib_error(self, reqId, errorCode, errorString, contract):
        """Handle IB API errors and adjust behavior"""
        # Error 10089: Market data subscription not available, use delayed
        if errorCode == 10089 and self.market_data_type == 1:
            logger.warning(f"Market data subscription not available (error 10089), "
                          f"switching to delayed data (type 3)")
            old_mode = self.market_data_type
            self.market_data_type = 3
            try:
                self.ib.reqMarketDataType(3)
                logger.info("Successfully switched to delayed market data")
                
                # Update feed mode gauge
                FEED_MODE.set(3)
                
                # Rotate all open writers to ensure feed_mode metadata is correct
                self._rotate_writers_for_feed_mode_change(old_mode, 3)
            except Exception as e:
                logger.error(f"Failed to switch to delayed data: {e}")
    
    def on_tick(self, ticker):
        """Handle incoming tick data"""
        tick_start = time.time()
        try:
            self.stats["events_received"] += 1
            
            # Get symbol
            symbol = ticker.contract.symbol
            feed_mode_str = "live" if self.market_data_type == 1 else "delayed"
            EVENTS_RECEIVED.labels(symbol=symbol, feed_mode=feed_mode_str).inc()
            
            # Check if we have valid data (both price and size must be valid)
            import math
            if ticker.last is None or not math.isfinite(ticker.last) or ticker.last <= 0:
                return  # Skip invalid price (NaN, Inf, zero, negative)
            
            if ticker.lastSize is None or not math.isfinite(ticker.lastSize) or ticker.lastSize <= 0:
                return  # Skip invalid size (None, NaN, Inf, zero, negative)
            
            # Create Trade event
            trade = eventlog_py.Trade()
            
            # Increment per-symbol sequence counter
            self.seq_counters[symbol] += 1
            
            # Fill header with correct timestamp semantics (TZ-safe)
            now_ns = time.time_ns()
            
            # Use exchange time if available (handle tz-awareness safely)
            trade.header.ts_event_ns = self._get_event_timestamp_ns(ticker, now_ns)
            trade.header.ts_receive_ns = now_ns  # Always our wall-clock receive time
            trade.header.ts_monotonic_ns = time.monotonic_ns()  # Monotonic for latency
            trade.header.venue = ticker.contract.exchange or "SMART"
            trade.header.symbol = symbol
            trade.header.source = "IBKR"
            trade.header.seq = self.seq_counters[symbol]  # Per-symbol monotonic sequence
            
            # Fill trade data (already validated above)
            trade.price = float(ticker.last)
            trade.size = float(ticker.lastSize)
            
            # Determine aggressor using improved inference
            # Method: Compare trade price to bid/ask with tick size tolerance
            trade.aggressor = self._infer_aggressor(
                price=ticker.last,
                bid=ticker.bid,
                ask=ticker.ask,
                midpoint=(ticker.bid + ticker.ask) / 2 if (ticker.bid and ticker.ask) else None
            )
            
            # Measure network latency (event time to receive time)
            # Only meaningful for live data (delayed data has 15-20 min artificial delay)
            if self.market_data_type == 1 and trade.header.ts_event_ns < now_ns:
                latency_sec = (now_ns - trade.header.ts_event_ns) / 1e9
                # Only record reasonable latencies (<60s) to avoid polluting histogram
                if latency_sec < 60.0:
                    NETWORK_LATENCY.labels(symbol=symbol, feed_mode=feed_mode_str).observe(latency_sec)
            
            # Write to EventLog
            writer = self.get_writer(symbol)
            if writer.append_trade(trade):
                self.stats["events_written"] += 1
                self.stats["last_event_ts"] = now_ns
                EVENTS_WRITTEN.labels(symbol=symbol, feed_mode=feed_mode_str).inc()
                
                # Increment precise per-symbol flush counter
                self.events_since_flush[symbol] = self.events_since_flush.get(symbol, 0) + 1
                
                # Check if flush needed (time-based or count-based)
                if self.check_flush_needed(symbol, self.events_since_flush[symbol]):
                    flush_start = time.time()
                    writer.flush()
                    flush_duration = time.time() - flush_start
                    FLUSH_DURATION.labels(symbol=symbol, feed_mode=feed_mode_str).observe(flush_duration)
                    
                    # Reset flush tracking
                    self.last_flush_time[symbol] = time.time()
                    self.events_since_flush[symbol] = 0
                    
                    if self.stats["events_written"] % 10000 == 0:
                        logger.info(f"Flushed {symbol}. Total written: {self.stats['events_written']}")
            else:
                self.stats["validation_errors"] += 1
                VALIDATION_ERRORS.labels(symbol=symbol, feed_mode=feed_mode_str).inc()
                logger.warning(f"Validation error for {symbol} trade")
            
            # Measure total tick processing duration
            tick_duration = time.time() - tick_start
            TICK_PROCESSING_DURATION.labels(symbol=symbol, feed_mode=feed_mode_str).observe(tick_duration)
                
        except Exception as e:
            logger.error(f"Error processing tick: {e}")
            self.stats["validation_errors"] += 1
    
    def run(self):
        """Main ingestion loop"""
        self.running = True
        
        # Connect to IB Gateway
        if not self.connect():
            logger.error("Failed to connect to IB Gateway")
            return False
        
        # Subscribe to market data
        if not self.subscribe_market_data():
            logger.error("Failed to subscribe to market data")
            return False
        
        # Register callbacks (idempotent - only once per run)
        if not self.callbacks_registered:
            # Register error handler
            self.ib.errorEvent += self.handle_ib_error
            
            # Register tick callback for all contracts
            for contract in self.contracts.values():
                ticker = self.ib.ticker(contract)
                ticker.updateEvent += self.on_tick
            
            self.callbacks_registered = True
            logger.info("Registered callbacks (error handler + tick updates)")
        
        logger.info("Ingestion started. Press Ctrl+C to stop.")
        logger.info("Statistics will be printed every 60 seconds.")
        
        # Monitor loop
        last_stats_time = time.time()
        last_date_check = time.time()
        
        try:
            while not self.should_stop:
                # Check for disconnection and reconnect if needed
                if not self.ib.isConnected():
                    logger.warning("Disconnected from IB Gateway, attempting reconnect...")
                    self.stats["reconnects"] += 1
                    RECONNECTS.inc()
                    CONNECTED_STATUS.set(0)
                    
                    # Exponential backoff: min(2^attempts * base_delay, max_delay)
                    delay = min(2 ** self.reconnect_attempts * self.base_reconnect_delay_sec, 
                               self.max_reconnect_delay)
                    logger.info(f"Waiting {delay}s before reconnect attempt {self.reconnect_attempts + 1}...")
                    time.sleep(delay)
                    
                    if self.connect() and self.subscribe_market_data():
                        # Callbacks already registered (idempotent - registered once at startup)
                        # ib_insync maintains ticker objects across reconnects
                        logger.info("Reconnected and resubscribed successfully")
                    else:
                        continue
                
                # Process IB events
                self.ib.sleep(1)
                
                # Check for date rollover every 60 seconds
                now = time.time()
                if now - last_date_check >= 60:
                    self.check_date_rollover()
                    last_date_check = now
                
                # Print stats and update metrics every 60 seconds
                if now - last_stats_time >= 60:
                    self.print_stats()
                    self.update_writer_metrics()
                    last_stats_time = now
                    
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        except Exception as e:
            logger.error(f"Fatal error in ingestion loop: {e}")
        finally:
            self.shutdown()
        
        return True
    
    def update_writer_metrics(self):
        """Poll C++ writer metrics and update Prometheus gauges"""
        for symbol, writer in self.writers.items():
            try:
                # Poll C++ writer metrics via bindings
                rows = writer.event_count()
                errors = writer.validation_errors()
                
                # Update Prometheus gauges
                WRITER_ROWS_WRITTEN.labels(symbol=symbol).set(rows)
                WRITER_VALIDATION_ERRORS.labels(symbol=symbol).set(errors)
            except Exception as e:
                logger.warning(f"Failed to update writer metrics for {symbol}: {e}")
    
    def print_stats(self):
        """Print current statistics"""
        logger.info("=" * 50)
        logger.info("FeedAdapter Statistics:")
        logger.info(f"  Events received: {self.stats['events_received']}")
        logger.info(f"  Events written: {self.stats['events_written']}")
        logger.info(f"  Validation errors: {self.stats['validation_errors']}")
        logger.info(f"  Connection errors: {self.stats['connection_errors']}")
        logger.info(f"  Reconnects: {self.stats['reconnects']}")
        logger.info(f"  Subscribed symbols: {len(self.subscribed_symbols)}")
        logger.info(f"  Connected: {self.ib.isConnected()}")
        logger.info("=" * 50)
    
    def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down...")
        
        # Close all writers
        for symbol, writer in self.writers.items():
            logger.info(f"Closing writer for {symbol}")
            writer.close()
        
        self.writers.clear()
        
        # Disconnect from IB
        if self.ib.isConnected():
            self.ib.disconnect()
            logger.info("Disconnected from IB Gateway")
        
        # Print final stats
        logger.info("\nFinal Statistics:")
        self.print_stats()
        
        logger.info("Shutdown complete")
        self.running = False


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Nexus IBKR Feed Adapter")
    parser.add_argument("--host", default="127.0.0.1", help="IB Gateway host")
    parser.add_argument("--port", type=int, default=4001, help="IB Gateway port")
    parser.add_argument("--client-id", type=int, default=42, help="IB client ID")
    parser.add_argument("--symbols", nargs="+", default=["AAPL", "MSFT", "SPY", "QQQ", "TSLA"],
                       help="Symbols to subscribe to")
    parser.add_argument("--parquet-dir", default="./data/parquet", help="Parquet output directory")
    parser.add_argument("--metrics-port", type=int, default=9401, help="Prometheus metrics port (0 to disable)")
    
    args = parser.parse_args()
    
    # Start Prometheus metrics server if enabled
    if args.metrics_port > 0 and start_http_server:
        try:
            start_http_server(args.metrics_port)
            logger.info(f"Prometheus metrics server started on port {args.metrics_port}")
        except Exception as e:
            logger.warning(f"Failed to start metrics server: {e}")
    
    logger.info("=" * 60)
    logger.info("Nexus IBKR Feed Adapter (Python)")
    logger.info("=" * 60)
    logger.info(f"Configuration:")
    logger.info(f"  IB Gateway: {args.host}:{args.port}")
    logger.info(f"  Client ID: {args.client_id}")
    logger.info(f"  Symbols: {', '.join(args.symbols)}")
    logger.info(f"  Output: {args.parquet_dir}")
    logger.info("")
    
    # Create and run adapter
    adapter = IBKRFeedAdapter(
        host=args.host,
        port=args.port,
        client_id=args.client_id,
        symbols=args.symbols,
        parquet_dir=args.parquet_dir
    )
    
    success = adapter.run()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())

