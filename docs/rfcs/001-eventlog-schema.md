# RFC-001: EventLog Arrow/Parquet Schema

**Status:** Implemented  
**Author:** Nexus Platform Team  
**Created:** 2025-01-09  
**Updated:** 2025-01-09

## Summary

Define the canonical Arrow schema for Nexus EventLog, specifying how market data events (depth updates, trades, orders) are serialized to Parquet for lossless recording and deterministic replay.

## Motivation

EventLog is the **single source of truth** for all market events in Nexus. Requirements:

1. **Lossless capture** - Zero data loss during ingestion
2. **Deterministic replay** - Exact state reconstruction from events
3. **Efficient storage** - Columnar compression for TB-scale data
4. **Fast queries** - Predicate pushdown for analysis
5. **Schema evolution** - Forward/backward compatibility
6. **Type safety** - Strong typing with validation

Arrow/Parquet provides:
- Columnar storage with excellent compression
- Zero-copy reads via memory mapping
- Rich type system (timestamps, enums, nested structs)
- Wide ecosystem (Python, C++, Rust, etc.)

## Design

### Schema Principles

1. **Common fields** in all events: `ts_event_ns`, `ts_receive_ns`, `ts_monotonic_ns`, `venue`, `symbol`, `source`, `seq`
2. **Nanosecond timestamps** as `int64` (ns since Unix epoch for wall-clock, arbitrary base for monotonic)
3. **Enums as dictionary-encoded int8** for efficiency
4. **No nulls in required fields** - use sentinel values if needed
5. **One Parquet file per session/day** - partition by date
6. **Decimal128 for prices** (future) - exact arithmetic, scale=6 (micropips)
7. **Schema versioning** - forward-compatible evolution only

### Event Types

All events stored in a single table with `event_type` discriminator.

#### Common Fields (All Events)

```
ts_event_ns:      int64      # Event timestamp (exchange/source time, wall-clock)
ts_receive_ns:    int64      # Receive timestamp (wall-clock, for audit/replay)
ts_monotonic_ns:  int64      # Monotonic timestamp (for latency measurement)
event_type:       int8       # Enum: DEPTH_UPDATE=1, TRADE=2, ORDER_EVENT=3, BAR=4, HEARTBEAT=5
venue:            string     # Exchange/venue identifier (e.g., "NASDAQ", "NYSE")
symbol:           string     # Instrument symbol (e.g., "AAPL", "MSFT")
source:           string     # Data source (e.g., "IBKR", "polygon", "internal")
seq:              uint64     # Monotonic sequence number (per source)
```

**Timestamp Semantics (Critical):**

- **`ts_event_ns`**: Wall-clock timestamp from exchange/source. Use for event ordering and market time. Must be within reasonable bounds (2020-2050).
- **`ts_receive_ns`**: Wall-clock timestamp when we received the event. Use for audit trails and replay. Must be ≥ `ts_event_ns` (allowing for clock skew).
- **`ts_monotonic_ns`**: Monotonic clock timestamp for latency measurement. Use to compute Data→Book, Book→Features latencies. Must be monotonically non-decreasing within a session.

**Why three timestamps?**
- Wall-clock for human time (audit, market hours, correlation with external events)
- Monotonic for latency measurement (immune to NTP adjustments, clock skew)
- Separate event vs receive to measure network/processing delays

#### DEPTH_UPDATE (event_type=1)

```
side:          int8       # BID=0, ASK=1 (dictionary-encoded)
price:         double     # Price level
size:          double     # Size at level
level:         uint32     # Level index (0=best, 1=second, etc.)
op:            int8       # ADD=0, UPDATE=1, DELETE=2 (dictionary-encoded)
```

#### TRADE (event_type=2)

```
price:         double     # Trade price
size:          double     # Trade size
aggressor:     int8       # BUY=0, SELL=1, UNKNOWN=2 (dictionary-encoded)
```

#### ORDER_EVENT (event_type=3)

```
order_id:      string     # Unique order identifier
state:         int8       # NEW=0, ACK=1, REPLACED=2, CANCELED=3, FILLED=4, REJECTED=5
price:         double     # Order price
size:          double     # Order size
filled:        double     # Filled quantity
reason:        string     # Rejection/cancel reason (empty if N/A)
```

#### BAR (event_type=4)

```
ts_open_ns:    int64      # Bar open timestamp
ts_close_ns:   int64      # Bar close timestamp
open:          double     # Open price
high:          double     # High price
low:           double     # Low price
close:         double     # Close price
volume:        double     # Volume
```

#### HEARTBEAT (event_type=5)

No additional fields beyond common fields.

### Arrow Schema Definition

```cpp
// Common fields schema
auto common_fields = {
    arrow::field("ts_event_ns", arrow::int64(), false),
    arrow::field("ts_receive_ns", arrow::int64(), false),
    arrow::field("ts_monotonic_ns", arrow::int64(), false),
    arrow::field("event_type", arrow::int8(), false),
    arrow::field("venue", arrow::utf8(), false),
    arrow::field("symbol", arrow::utf8(), false),
    arrow::field("source", arrow::utf8(), false),
    arrow::field("seq", arrow::uint64(), false),
};

// Event-specific fields (nullable for events that don't use them)
auto event_fields = {
    // DEPTH_UPDATE
    arrow::field("side", arrow::int8(), true),
    arrow::field("price", arrow::float64(), true),
    arrow::field("size", arrow::float64(), true),
    arrow::field("level", arrow::uint32(), true),
    arrow::field("op", arrow::int8(), true),
    
    // TRADE
    arrow::field("aggressor", arrow::int8(), true),
    // (reuses price, size)
    
    // ORDER_EVENT
    arrow::field("order_id", arrow::utf8(), true),
    arrow::field("state", arrow::int8(), true),
    arrow::field("filled", arrow::float64(), true),
    arrow::field("reason", arrow::utf8(), true),
    // (reuses price, size)
    
    // BAR
    arrow::field("ts_open_ns", arrow::int64(), true),
    arrow::field("ts_close_ns", arrow::int64(), true),
    arrow::field("open", arrow::float64(), true),
    arrow::field("high", arrow::float64(), true),
    arrow::field("low", arrow::float64(), true),
    arrow::field("close", arrow::float64(), true),
    arrow::field("volume", arrow::float64(), true),
};
```

### Parquet File Organization

```
data/parquet/
├── AAPL/
│   ├── 2025/
│   │   ├── 01/
│   │   │   ├── 09.parquet    # Nested by date for directory fanout
│   │   │   ├── 10.parquet
│   │   │   └── ...
│   │   └── 02/
│   │       └── ...
│   └── ...
├── MSFT/
│   └── 2025/01/09.parquet
└── ...
```

**File naming:** `{symbol}/{YYYY}/{MM}/{DD}.parquet`

**Compression:** ZSTD (level 3) - good balance of speed/ratio

**Row group size:** 100,000 events (~10MB uncompressed)

**File metadata (key-value):**
- `schema_version`: "1.0" (semantic versioning)
- `nexus_version`: "0.2.0"
- `ingest_session_id`: UUID for deduplication
- `ingest_start_ns`: First event timestamp
- `ingest_end_ns`: Last event timestamp
- `symbol`: Primary symbol in file
- `venue`: Primary venue
- `source`: Data source identifier

### Replay Parity Contract

**Invariant:** Given an EventLog, replaying events in `seq` order must reconstruct identical state.

**Test:**
1. Write N events to Parquet
2. Read events back in order
3. Assert: `events_written == events_read` (field-by-field)
4. Build state (e.g., OrderBook) from events
5. Assert: `state_from_events == expected_state`

**Golden dataset:** 50-200 events covering all types, edge cases (empty book, crossed quotes, etc.)

### Validation Invariants

**Enforced at write time:**

1. **Timestamps:**
   - `ts_event_ns` ∈ [2020-01-01, 2050-01-01] (wall-clock sanity)
   - `ts_receive_ns` ≥ `ts_event_ns - 60s` (allow clock skew)
   - `ts_monotonic_ns` ≥ previous `ts_monotonic_ns` (monotonic within session)

2. **Sequences:**
   - `seq` > 0 (no zero sequences)
   - `seq` > previous `seq` for same (source, symbol) (strict monotonic)

3. **Numeric fields:**
   - `price` ≥ 0 and finite (no negative prices, no NaN/Inf)
   - `size` ≥ 0 and finite (allow zero for deletes)
   - `level` < 1000 (sanity check on depth level)

4. **Event-specific:**
   - DEPTH_UPDATE: `level` ≥ 0, `price` > 0 (except DELETE)
   - TRADE: `price` > 0, `size` > 0
   - ORDER_EVENT: `filled` ≤ `size`
   - BAR: `high` ≥ `low`, `open/high/low/close` all finite

**Violation handling:**
- Log error with full event context
- Optionally reject event (configurable: strict vs permissive mode)
- Emit metric: `eventlog_validation_errors_total{type, field}`

## Alternatives Considered

### 1. FlatBuffers
- **Pro:** Zero-copy, schema evolution, fast
- **Con:** Not columnar, poor compression, less ecosystem support
- **Decision:** Rejected - Parquet better for analytics and storage

### 2. Protocol Buffers
- **Pro:** Strong typing, schema evolution, wide support
- **Con:** Row-oriented, poor compression, no columnar queries
- **Decision:** Rejected - Not optimized for time-series data

### 3. CapnProto
- **Pro:** Zero-copy, fast serialization
- **Con:** Immature ecosystem, no columnar storage
- **Decision:** Rejected - Arrow/Parquet is industry standard

### 4. Single table vs. separate tables per event type
- **Pro (separate):** Simpler schema, no nulls
- **Con (separate):** Hard to maintain time-ordering across tables
- **Decision:** Single table with `event_type` discriminator - preserves global ordering

### 5. Float64 vs. Decimal128 for prices
- **Pro (float64):** Native CPU support, fast arithmetic
- **Con (float64):** Rounding errors, not exact for money
- **Pro (decimal128):** Exact arithmetic, no rounding
- **Con (decimal128):** Slower, more complex
- **Decision:** Float64 for v1.0 (speed), migrate to Decimal128 in v2.0 (correctness)
  - Scale: price=6 (micropips), size=3 (millis)
  - Migration: add `price_decimal`, `size_decimal` columns, deprecate float64 versions

### 6. Two timestamps vs. three
- **Decision:** Three timestamps required:
  - Wall-clock for event time (market correlation)
  - Wall-clock for receive time (audit trail)
  - Monotonic for latency (immune to NTP)

## Testing Strategy

### Unit Tests
- Schema validation (required fields, types)
- Round-trip write/read for each event type
- Enum encoding/decoding
- Timestamp precision (ns)

### Property Tests
- Write N random events → read → assert equality
- Replay parity: state(events) == state(replay(events))
- Compression ratio > 3x for typical market data

### Golden Dataset Tests
- 50-200 hand-crafted events covering:
  - All event types
  - Edge cases (empty book, crossed quotes, zero size)
  - Timestamp ordering
  - Sequence gaps
- Assert: replay produces expected OrderBook state

### Performance Tests
- Write throughput: > 100k events/sec
- Read throughput: > 500k events/sec
- Compression ratio: > 5x for real market data
- Memory usage: < 100MB for 1M events

## Migration Path

### Phase 0 → Phase 1
1. Implement Arrow/Parquet writer/reader in `cpp/eventlog/`
2. Replace placeholder binary format
3. Update Python bindings
4. Add golden dataset tests
5. Update CI to install Arrow/Parquet
6. Document in README

### Backward Compatibility

**v0.1 → v0.2:**
- **Breaking:** Added `ts_monotonic_ns` (required field)
- **Migration:** Delete v0.1 files (no production data yet)
- **Rationale:** Critical for latency measurement

**v0.2 → v1.0 (future):**
- Add `price_decimal`, `size_decimal` (nullable)
- Add `ingest_session_id` (nullable)
- Deprecate `price`, `size` (float64)
- **Migration:** Dual-write both formats, read decimal first (fallback to float64)

### Schema Evolution Rules

1. **Forward-compatible only:** New readers must handle old files
2. **Add fields as nullable:** Never add required fields (except major version bump)
3. **Never remove fields:** Deprecate instead
4. **Never rename fields:** Add new field, deprecate old
5. **Document in RFC:** All changes require RFC amendment
6. **Version in metadata:** `schema_version` key in Parquet metadata

**Version semantics:**
- Major (X.0.0): Breaking changes (incompatible schema)
- Minor (1.X.0): Backward-compatible additions
- Patch (1.0.X): Bug fixes, no schema changes

## Performance Characteristics

### Write Performance
- **Batched writes:** 100k events/sec (single thread)
- **Latency:** < 10μs per event (buffered)
- **Memory:** ~50MB buffer per writer

### Read Performance
- **Sequential scan:** 500k events/sec
- **Predicate pushdown:** 10x faster for filtered queries
- **Memory-mapped:** Zero-copy reads

### Storage
- **Compression ratio:** 5-10x for market data
- **1M events:** ~10-20MB compressed
- **1 day (10 symbols):** ~100-200MB

## References

- [Apache Arrow](https://arrow.apache.org/)
- [Apache Parquet](https://parquet.apache.org/)
- [Arrow C++ Cookbook](https://arrow.apache.org/cookbook/cpp/)
- [Parquet Format Spec](https://github.com/apache/parquet-format)

## Appendix: Example Usage

### C++ Write

```cpp
#include "nexus/eventlog/writer.hpp"

nexus::eventlog::Writer writer("data/parquet/AAPL/2025-01-09.parquet");

nexus::eventlog::Trade trade;
trade.header.ts_event_ns = nexus::time::wall_ns();
trade.header.ts_receive_ns = nexus::time::monotonic_ns();
trade.header.venue = "NASDAQ";
trade.header.symbol = "AAPL";
trade.header.source = "IBKR";
trade.header.seq = 1;
trade.price = 178.50;
trade.size = 100.0;
trade.aggressor = nexus::eventlog::Aggressor::BUY;

writer.append(trade);
writer.flush();
```

### C++ Read

```cpp
#include "nexus/eventlog/reader.hpp"

nexus::eventlog::Reader reader("data/parquet/AAPL/2025-01-09.parquet");

while (auto event = reader.next()) {
    std::visit([](auto&& e) {
        std::cout << "Event: " << e.header.symbol << std::endl;
    }, *event);
}
```

### Python

```python
from nexus.eventlog import Writer, Reader, Trade

writer = Writer("data/parquet/AAPL/2025-01-09.parquet")
trade = Trade(
    ts_event_ns=time.time_ns(),
    venue="NASDAQ",
    symbol="AAPL",
    price=178.50,
    size=100.0
)
writer.append(trade)
writer.flush()

reader = Reader("data/parquet/AAPL/2025-01-09.parquet")
for event in reader:
    print(f"Event: {event.symbol}")
```

---

**Status:** Implemented in Phase 1  
**Next:** RFC-002 will define L1 OrderBook interface and invariants

