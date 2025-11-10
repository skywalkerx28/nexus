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
        
        # Per-symbol sequence counters (monotonic within symbol)
        self.seq_counters: Dict[str, int] = {sym: 0 for sym in self.symbols}
        
        # Last flush time per symbol (for time-based flush)
        self.last_flush_time: Dict[str, float] = {}
        
        # Current date for rollover detection
        self.current_date: str = ""
        
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
            
            # Request delayed market data (type 3) if real-time not available
            # Type 1 = real-time, Type 3 = delayed (15-20 min), Type 4 = delayed frozen
            try:
                self.ib.reqMarketDataType(3)  # Start with delayed
                logger.info("Requested delayed market data (type 3)")
            except Exception as e:
                logger.warning(f"Could not set market data type: {e}")
            
            self.reconnect_attempts = 0  # Reset on successful connect
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self.stats["connection_errors"] += 1
            self.reconnect_attempts += 1
            return False
    
    def subscribe_market_data(self) -> bool:
        """Subscribe to market data for configured symbols"""
        try:
            logger.info(f"Subscribing to {len(self.symbols)} symbols...")
            
            for symbol in self.symbols:
                # Create contract
                contract = Stock(symbol, "SMART", "USD")
                self.contracts[symbol] = contract
                
                # Request market data
                self.ib.reqMktData(contract, "", False, False)
                self.subscribed_symbols.add(symbol)
                
                logger.info(f"  Subscribed to {symbol}")
            
            logger.info(f"Successfully subscribed to {len(self.symbols)} symbols")
            return True
            
        except Exception as e:
            logger.error(f"Failed to subscribe: {e}")
            self.stats["connection_errors"] += 1
            return False
    
    def check_date_rollover(self):
        """Check if date has changed and close/reopen writers"""
        from datetime import datetime
        current_date = datetime.now().strftime("%Y-%m-%d")
        
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
            self.writers[symbol] = writer
            self.last_flush_time[symbol] = time.time()
        
        return self.writers[symbol]
    
    def on_tick(self, ticker):
        """Handle incoming tick data"""
        try:
            self.stats["events_received"] += 1
            
            # Get symbol
            symbol = ticker.contract.symbol
            
            # Check if we have valid data
            import math
            if ticker.last is None or not math.isfinite(ticker.last) or ticker.last <= 0:
                return  # Skip invalid ticks (NaN, Inf, zero, negative)
            
            # Create Trade event
            trade = eventlog_py.Trade()
            
            # Increment per-symbol sequence counter
            self.seq_counters[symbol] += 1
            
            # Fill header
            now_ns = time.time_ns()
            trade.header.ts_event_ns = now_ns
            trade.header.ts_receive_ns = now_ns
            trade.header.ts_monotonic_ns = time.monotonic_ns()
            trade.header.venue = ticker.contract.exchange or "SMART"
            trade.header.symbol = symbol
            trade.header.source = "IBKR"
            trade.header.seq = self.seq_counters[symbol]  # Per-symbol monotonic sequence
            
            # Fill trade data
            trade.price = float(ticker.last)
            trade.size = float(ticker.lastSize) if ticker.lastSize else 100.0
            
            # Determine aggressor from bid/ask
            if ticker.bid and ticker.ask:
                if abs(ticker.last - ticker.ask) < abs(ticker.last - ticker.bid):
                    trade.aggressor = eventlog_py.Aggressor.BUY
                elif abs(ticker.last - ticker.bid) < abs(ticker.last - ticker.ask):
                    trade.aggressor = eventlog_py.Aggressor.SELL
                else:
                    trade.aggressor = eventlog_py.Aggressor.UNKNOWN
            else:
                trade.aggressor = eventlog_py.Aggressor.UNKNOWN
            
            # Write to EventLog
            writer = self.get_writer(symbol)
            if writer.append_trade(trade):
                self.stats["events_written"] += 1
                self.stats["last_event_ts"] = now_ns
                
                # Check if flush needed (time-based or count-based)
                events_since_flush = writer.event_count() % 2000
                if self.check_flush_needed(symbol, events_since_flush):
                    writer.flush()
                    self.last_flush_time[symbol] = time.time()
                    if self.stats["events_written"] % 10000 == 0:
                        logger.info(f"Flushed {symbol}. Total written: {self.stats['events_written']}")
            else:
                self.stats["validation_errors"] += 1
                logger.warning(f"Validation error for {symbol} trade")
                
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
        
        # Register tick callback
        for contract in self.contracts.values():
            ticker = self.ib.ticker(contract)
            ticker.updateEvent += self.on_tick
        
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
                    
                    # Exponential backoff: min(2^attempts * base_delay, max_delay)
                    delay = min(2 ** self.reconnect_attempts * self.config.reconnect_delay_sec, 
                               self.max_reconnect_delay)
                    logger.info(f"Waiting {delay}s before reconnect attempt {self.reconnect_attempts + 1}...")
                    time.sleep(delay)
                    
                    if self.connect() and self.subscribe_market_data():
                        # Re-register callbacks
                        for contract in self.contracts.values():
                            ticker = self.ib.ticker(contract)
                            ticker.updateEvent += self.on_tick
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
                
                # Print stats every 60 seconds
                if now - last_stats_time >= 60:
                    self.print_stats()
                    last_stats_time = now
                    
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        except Exception as e:
            logger.error(f"Fatal error in ingestion loop: {e}")
        finally:
            self.shutdown()
        
        return True
    
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
    
    args = parser.parse_args()
    
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

