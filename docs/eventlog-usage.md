# EventLog Usage Guide

## Overview

EventLog is Nexus's append-only, deterministic event storage system built on Arrow/Parquet. It provides lossless recording and replay of all market events.

## Quick Start

### C++ Write Example

```cpp
#include "nexus/eventlog/writer.hpp"
#include "nexus/time.hpp"

// Create writer
nexus::eventlog::Writer writer("data/parquet/AAPL/2025-01-09.parquet");

// Create a trade event
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

// Write event
writer.append(trade);

// Flush to disk
writer.flush();
```

### C++ Read Example

```cpp
#include "nexus/eventlog/reader.hpp"
#include <iostream>

// Open reader
nexus::eventlog::Reader reader("data/parquet/AAPL/2025-01-09.parquet");

std::cout << "Total events: " << reader.event_count() << std::endl;

// Read all events
while (auto event = reader.next()) {
    std::visit([](auto&& e) {
        std::cout << "Symbol: " << e.header.symbol 
                  << ", Seq: " << e.header.seq << std::endl;
    }, *event);
}
```

### Python Example

```python
from nexus.eventlog import Writer, Reader, Trade, Aggressor
import time

# Write events
writer = Writer("data/parquet/AAPL/2025-01-09.parquet")

trade = Trade()
trade.ts_event_ns = time.time_ns()
trade.ts_receive_ns = time.time_ns()
trade.venue = "NASDAQ"
trade.symbol = "AAPL"
trade.source = "IBKR"
trade.seq = 1
trade.price = 178.50
trade.size = 100.0
trade.aggressor = Aggressor.BUY

writer.append(trade)
writer.flush()

# Read events
reader = Reader("data/parquet/AAPL/2025-01-09.parquet")
print(f"Total events: {reader.event_count()}")

for event in reader:
    print(f"Symbol: {event.symbol}, Seq: {event.seq}")
```

## Event Types

### DEPTH_UPDATE

```cpp
nexus::eventlog::DepthUpdate update;
update.header = make_header("AAPL");
update.side = nexus::eventlog::Side::BID;
update.price = 178.00;
update.size = 100.0;
update.level = 0;  // Best bid
update.op = nexus::eventlog::DepthOp::ADD;

writer.append(update);
```

### TRADE

```cpp
nexus::eventlog::Trade trade;
trade.header = make_header("AAPL");
trade.price = 178.01;
trade.size = 50.0;
trade.aggressor = nexus::eventlog::Aggressor::BUY;

writer.append(trade);
```

### ORDER_EVENT

```cpp
nexus::eventlog::OrderEvent order;
order.header = make_header("AAPL");
order.order_id = "ORDER-001";
order.state = nexus::eventlog::OrderState::ACK;
order.price = 178.00;
order.size = 100.0;
order.filled = 0.0;
order.reason = "";

writer.append(order);
```

### BAR

```cpp
nexus::eventlog::Bar bar;
bar.header = make_header("AAPL");
bar.ts_open_ns = start_time;
bar.ts_close_ns = end_time;
bar.open = 177.95;
bar.high = 178.10;
bar.low = 177.90;
bar.close = 178.01;
bar.volume = 10000.0;

writer.append(bar);
```

### HEARTBEAT

```cpp
nexus::eventlog::Heartbeat hb;
hb.header = make_header("AAPL");

writer.append(hb);
```

## Best Practices

### File Organization

```
data/parquet/
├── AAPL/
│   ├── 2025-01-09.parquet
│   ├── 2025-01-10.parquet
│   └── ...
├── MSFT/
│   └── 2025-01-09.parquet
└── ...
```

- One file per symbol per day
- Naming: `{symbol}/{YYYY-MM-DD}.parquet`
- Compression: ZSTD level 3 (automatic)

### Batching

Writer automatically batches events (10,000 per batch). For best performance:

```cpp
Writer writer("data.parquet");

// Write many events
for (const auto& event : events) {
    writer.append(event);  // Buffered
}

// Explicit flush when done
writer.flush();  // Writes remaining batch
```

### Error Handling

```cpp
try {
    Writer writer("data.parquet");
    if (!writer.append(event)) {
        // Handle write failure
    }
    writer.flush();
} catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << std::endl;
}
```

### Replay Pattern

```cpp
Reader reader("data.parquet");

// Process events in order
while (auto event = reader.next()) {
    std::visit([&](auto&& e) {
        // Dispatch to handler based on type
        if constexpr (std::is_same_v<std::decay_t<decltype(e)>, Trade>) {
            handle_trade(e);
        } else if constexpr (std::is_same_v<std::decay_t<decltype(e)>, DepthUpdate>) {
            handle_depth(e);
        }
        // ... etc
    }, *event);
}
```

## Schema Details

See [RFC-001](rfcs/001-eventlog-schema.md) for complete schema specification.

### Common Fields (All Events)

| Field | Type | Description |
|-------|------|-------------|
| `ts_event_ns` | int64 | Event timestamp (exchange time) |
| `ts_receive_ns` | int64 | Receive timestamp (our time) |
| `event_type` | int8 | Event type enum |
| `venue` | string | Exchange/venue identifier |
| `symbol` | string | Instrument symbol |
| `source` | string | Data source |
| `seq` | uint64 | Sequence number |

### Performance

- **Write throughput:** >100k events/sec (single thread)
- **Read throughput:** >500k events/sec
- **Compression ratio:** 5-10x for market data
- **Latency:** <10μs per event (buffered writes)

## Testing

### Unit Test

```cpp
#include "nexus/eventlog/writer.hpp"
#include "nexus/eventlog/reader.hpp"
#include <gtest/gtest.h>

TEST(EventLogTest, WriteAndRead) {
    std::string file = "/tmp/test.parquet";
    
    // Write
    {
        Writer writer(file);
        Trade trade;
        trade.header.symbol = "TEST";
        trade.price = 100.0;
        writer.append(trade);
    }
    
    // Read
    {
        Reader reader(file);
        auto event = reader.next();
        ASSERT_TRUE(event.has_value());
        
        auto* trade = std::get_if<Trade>(&*event);
        ASSERT_NE(trade, nullptr);
        EXPECT_EQ(trade->header.symbol, "TEST");
        EXPECT_DOUBLE_EQ(trade->price, 100.0);
    }
}
```

### Replay Parity Test

```cpp
// Write golden dataset
auto golden_events = generate_golden_dataset();
Writer writer("test.parquet");
for (const auto& event : golden_events) {
    writer.append(event);
}
writer.flush();

// Read back
Reader reader("test.parquet");
std::vector<Event> read_events;
while (auto event = reader.next()) {
    read_events.push_back(*event);
}

// Assert equality
ASSERT_EQ(read_events.size(), golden_events.size());
for (size_t i = 0; i < golden_events.size(); ++i) {
    // Field-by-field comparison
    EXPECT_EQ(get_header(golden_events[i]).seq, 
              get_header(read_events[i]).seq);
    // ... etc
}
```

## Troubleshooting

### "Failed to open file"

- Check file path exists
- Verify write permissions
- Ensure parent directory exists

### "Failed to create Parquet writer"

- Verify Arrow/Parquet libraries installed
- Check CMake found Arrow correctly
- Link against `Arrow::arrow_shared` and `Parquet::parquet_shared`

### "Schema mismatch"

- Ensure all events use same schema version
- Check RFC-001 for canonical schema
- Don't mix old placeholder format with new Parquet format

### Performance Issues

- Use batched writes (don't flush every event)
- Enable compression (ZSTD level 3)
- Use SSD for storage
- Profile with `perf` or similar tools

## References

- [RFC-001: EventLog Schema](rfcs/001-eventlog-schema.md)
- [Apache Arrow](https://arrow.apache.org/)
- [Apache Parquet](https://parquet.apache.org/)
- [Arrow C++ Cookbook](https://arrow.apache.org/cookbook/cpp/)

