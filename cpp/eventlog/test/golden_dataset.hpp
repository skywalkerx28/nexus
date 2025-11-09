#pragma once

#include "nexus/eventlog/schema.hpp"
#include "nexus/time.hpp"
#include <vector>

namespace nexus::eventlog::test {

/**
 * Generate a golden dataset for testing replay parity.
 * Contains 100 events covering all types and edge cases.
 */
inline std::vector<Event> generate_golden_dataset() {
  std::vector<Event> events;
  int64_t base_ts = 1704844800'000000000L;  // 2024-01-10 00:00:00 UTC
  uint64_t seq = 1;

  auto make_header = [&](const std::string& symbol) {
    EventHeader h;
    h.ts_event_ns = base_ts;
    h.ts_receive_ns = base_ts + 1000;       // 1μs latency (wall-clock)
    h.ts_monotonic_ns = base_ts + 500;      // Monotonic timestamp
    h.venue = "TEST";
    h.symbol = symbol;
    h.source = "golden";
    h.seq = seq++;
    base_ts += 1'000'000;  // 1ms between events
    return h;
  };

  // Heartbeat
  {
    Heartbeat hb;
    hb.header = make_header("AAPL");
    events.push_back(hb);
  }

  // Build initial book: 3 levels on each side
  for (int level = 0; level < 3; ++level) {
    // Bids
    DepthUpdate bid;
    bid.header = make_header("AAPL");
    bid.side = Side::BID;
    bid.price = 178.00 - level * 0.01;
    bid.size = 100.0 * (level + 1);
    bid.level = level;
    bid.op = DepthOp::ADD;
    events.push_back(bid);

    // Asks
    DepthUpdate ask;
    ask.header = make_header("AAPL");
    ask.side = Side::ASK;
    ask.price = 178.02 + level * 0.01;
    ask.size = 100.0 * (level + 1);
    ask.level = level;
    ask.op = DepthOp::ADD;
    events.push_back(ask);
  }

  // Trade at mid
  {
    Trade trade;
    trade.header = make_header("AAPL");
    trade.price = 178.01;
    trade.size = 50.0;
    trade.aggressor = Aggressor::BUY;
    events.push_back(trade);
  }

  // Update best bid
  {
    DepthUpdate update;
    update.header = make_header("AAPL");
    update.side = Side::BID;
    update.price = 178.00;
    update.size = 150.0;  // Increased size
    update.level = 0;
    update.op = DepthOp::UPDATE;
    events.push_back(update);
  }

  // Delete level 2 ask
  {
    DepthUpdate del;
    del.header = make_header("AAPL");
    del.side = Side::ASK;
    del.price = 178.04;
    del.size = 0.0;
    del.level = 2;
    del.op = DepthOp::DELETE;
    events.push_back(del);
  }

  // Order events
  {
    OrderEvent order;
    order.header = make_header("AAPL");
    order.order_id = "ORDER-001";
    order.state = OrderState::NEW;
    order.price = 178.00;
    order.size = 100.0;
    order.filled = 0.0;
    order.reason = "";
    events.push_back(order);

    order.header = make_header("AAPL");
    order.state = OrderState::ACK;
    events.push_back(order);

    order.header = make_header("AAPL");
    order.state = OrderState::FILLED;
    order.filled = 100.0;
    events.push_back(order);
  }

  // Bar
  {
    Bar bar;
    bar.header = make_header("AAPL");
    bar.ts_open_ns = base_ts - 60'000'000'000L;  // 1 minute ago
    bar.ts_close_ns = base_ts;
    bar.open = 177.95;
    bar.high = 178.10;
    bar.low = 177.90;
    bar.close = 178.01;
    bar.volume = 10000.0;
    events.push_back(bar);
  }

  // Edge cases
  // Very small size trade (minimum valid)
  {
    Trade trade;
    trade.header = make_header("AAPL");
    trade.price = 178.01;
    trade.size = 0.001;  // Minimum valid size (not zero)
    trade.aggressor = Aggressor::UNKNOWN;
    events.push_back(trade);
  }

  // Very large size
  {
    DepthUpdate update;
    update.header = make_header("AAPL");
    update.side = Side::BID;
    update.price = 177.99;
    update.size = 1'000'000.0;
    update.level = 1;
    update.op = DepthOp::UPDATE;
    events.push_back(update);
  }

  // Rejected order
  {
    OrderEvent order;
    order.header = make_header("AAPL");
    order.order_id = "ORDER-002";
    order.state = OrderState::REJECTED;
    order.price = 180.00;
    order.size = 100.0;
    order.filled = 0.0;
    order.reason = "Price too far from market";
    events.push_back(order);
  }

  // Multiple symbols
  for (const auto& symbol : {"MSFT", "SPY", "TSLA"}) {
    Heartbeat hb;
    hb.header = make_header(symbol);
    events.push_back(hb);

    Trade trade;
    trade.header = make_header(symbol);
    trade.price = 100.0;
    trade.size = 100.0;
    trade.aggressor = Aggressor::SELL;
    events.push_back(trade);
  }

  // Add more events to reach ~100
  for (int i = 0; i < 60; ++i) {
    if (i % 3 == 0) {
      Trade trade;
      trade.header = make_header("AAPL");
      trade.price = 178.00 + (i % 10) * 0.01;
      trade.size = 10.0 * (i % 5 + 1);
      trade.aggressor = (i % 2 == 0) ? Aggressor::BUY : Aggressor::SELL;
      events.push_back(trade);
    } else if (i % 3 == 1) {
      DepthUpdate update;
      update.header = make_header("AAPL");
      update.side = (i % 2 == 0) ? Side::BID : Side::ASK;
      update.price = (update.side == Side::BID) ? 178.00 - (i % 3) * 0.01
                                                 : 178.02 + (i % 3) * 0.01;
      update.size = 100.0 + i * 10.0;
      update.level = i % 3;
      update.op = DepthOp::UPDATE;
      events.push_back(update);
    } else {
      Heartbeat hb;
      hb.header = make_header("AAPL");
      events.push_back(hb);
    }
  }

  return events;
}

}  // namespace nexus::eventlog::test

