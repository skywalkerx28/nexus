#include "nexus/eventlog/validator.hpp"
#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <cmath>

using namespace nexus::eventlog;

TEST(ValidatorTest, ValidHeaderPasses) {
  EventHeader header;
  header.ts_event_ns = nexus::time::wall_ns();
  header.ts_receive_ns = nexus::time::wall_ns();
  header.ts_monotonic_ns = nexus::time::monotonic_ns();
  header.venue = "NASDAQ";
  header.symbol = "AAPL";
  header.source = "IBKR";
  header.seq = 1;

  auto result = Validator::validate_header(header);
  EXPECT_TRUE(result.valid) << result.error_message;
}

TEST(ValidatorTest, InvalidTimestampRejected) {
  EventHeader header;
  header.ts_event_ns = 946684800'000000000L;  // 2000-01-01 (too old)
  header.ts_receive_ns = nexus::time::wall_ns();
  header.ts_monotonic_ns = nexus::time::monotonic_ns();
  header.venue = "NASDAQ";
  header.symbol = "AAPL";
  header.source = "IBKR";
  header.seq = 1;

  auto result = Validator::validate_header(header);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("out of bounds"), std::string::npos);
}

TEST(ValidatorTest, ZeroSequenceRejected) {
  EventHeader header;
  header.ts_event_ns = nexus::time::wall_ns();
  header.ts_receive_ns = nexus::time::wall_ns();
  header.ts_monotonic_ns = nexus::time::monotonic_ns();
  header.venue = "NASDAQ";
  header.symbol = "AAPL";
  header.source = "IBKR";
  header.seq = 0;  // Invalid

  auto result = Validator::validate_header(header);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("seq"), std::string::npos);
}

TEST(ValidatorTest, EmptyVenueRejected) {
  EventHeader header;
  header.ts_event_ns = nexus::time::wall_ns();
  header.ts_receive_ns = nexus::time::wall_ns();
  header.ts_monotonic_ns = nexus::time::monotonic_ns();
  header.venue = "";  // Invalid
  header.symbol = "AAPL";
  header.source = "IBKR";
  header.seq = 1;

  auto result = Validator::validate_header(header);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("venue"), std::string::npos);
}

TEST(ValidatorTest, ValidTradePassess) {
  Trade trade;
  trade.header.ts_event_ns = nexus::time::wall_ns();
  trade.header.ts_receive_ns = nexus::time::wall_ns();
  trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  trade.header.venue = "NASDAQ";
  trade.header.symbol = "AAPL";
  trade.header.source = "IBKR";
  trade.header.seq = 1;
  trade.price = 178.50;
  trade.size = 100.0;
  trade.aggressor = Aggressor::BUY;

  auto result = Validator::validate(trade);
  EXPECT_TRUE(result.valid) << result.error_message;
}

TEST(ValidatorTest, NegativePriceRejected) {
  Trade trade;
  trade.header.ts_event_ns = nexus::time::wall_ns();
  trade.header.ts_receive_ns = nexus::time::wall_ns();
  trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  trade.header.venue = "NASDAQ";
  trade.header.symbol = "AAPL";
  trade.header.source = "IBKR";
  trade.header.seq = 1;
  trade.price = -178.50;  // Invalid
  trade.size = 100.0;
  trade.aggressor = Aggressor::BUY;

  auto result = Validator::validate(trade);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("price"), std::string::npos);
}

TEST(ValidatorTest, NaNPriceRejected) {
  Trade trade;
  trade.header.ts_event_ns = nexus::time::wall_ns();
  trade.header.ts_receive_ns = nexus::time::wall_ns();
  trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  trade.header.venue = "NASDAQ";
  trade.header.symbol = "AAPL";
  trade.header.source = "IBKR";
  trade.header.seq = 1;
  trade.price = std::nan("");  // Invalid
  trade.size = 100.0;
  trade.aggressor = Aggressor::BUY;

  auto result = Validator::validate(trade);
  EXPECT_FALSE(result.valid);
}

TEST(ValidatorTest, ZeroSizeTradeRejected) {
  Trade trade;
  trade.header.ts_event_ns = nexus::time::wall_ns();
  trade.header.ts_receive_ns = nexus::time::wall_ns();
  trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  trade.header.venue = "NASDAQ";
  trade.header.symbol = "AAPL";
  trade.header.source = "IBKR";
  trade.header.seq = 1;
  trade.price = 178.50;
  trade.size = 0.0;  // Invalid for trades
  trade.aggressor = Aggressor::BUY;

  auto result = Validator::validate(trade);
  EXPECT_FALSE(result.valid);
}

TEST(ValidatorTest, ValidDepthUpdatePasses) {
  DepthUpdate update;
  update.header.ts_event_ns = nexus::time::wall_ns();
  update.header.ts_receive_ns = nexus::time::wall_ns();
  update.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  update.header.venue = "NASDAQ";
  update.header.symbol = "AAPL";
  update.header.source = "IBKR";
  update.header.seq = 1;
  update.side = Side::BID;
  update.price = 178.00;
  update.size = 100.0;
  update.level = 0;
  update.op = DepthOp::ADD;

  auto result = Validator::validate(update);
  EXPECT_TRUE(result.valid) << result.error_message;
}

TEST(ValidatorTest, DeleteWithZeroSizeAllowed) {
  DepthUpdate update;
  update.header.ts_event_ns = nexus::time::wall_ns();
  update.header.ts_receive_ns = nexus::time::wall_ns();
  update.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  update.header.venue = "NASDAQ";
  update.header.symbol = "AAPL";
  update.header.source = "IBKR";
  update.header.seq = 1;
  update.side = Side::BID;
  update.price = 178.00;
  update.size = 0.0;  // OK for DELETE
  update.level = 0;
  update.op = DepthOp::DELETE;

  auto result = Validator::validate(update);
  EXPECT_TRUE(result.valid) << result.error_message;
}

TEST(ValidatorTest, OrderFilledExceedsSizeRejected) {
  OrderEvent order;
  order.header.ts_event_ns = nexus::time::wall_ns();
  order.header.ts_receive_ns = nexus::time::wall_ns();
  order.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  order.header.venue = "NASDAQ";
  order.header.symbol = "AAPL";
  order.header.source = "IBKR";
  order.header.seq = 1;
  order.order_id = "ORDER-001";
  order.state = OrderState::FILLED;
  order.price = 178.00;
  order.size = 100.0;
  order.filled = 150.0;  // Invalid: filled > size
  order.reason = "";

  auto result = Validator::validate(order);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("filled"), std::string::npos);
}

TEST(ValidatorTest, BarHighLowInvariant) {
  Bar bar;
  bar.header.ts_event_ns = nexus::time::wall_ns();
  bar.header.ts_receive_ns = nexus::time::wall_ns();
  bar.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  bar.header.venue = "NASDAQ";
  bar.header.symbol = "AAPL";
  bar.header.source = "IBKR";
  bar.header.seq = 1;
  bar.ts_open_ns = bar.header.ts_event_ns - 60'000'000'000L;
  bar.ts_close_ns = bar.header.ts_event_ns;
  bar.open = 178.00;
  bar.high = 177.00;  // Invalid: high < low
  bar.low = 178.50;
  bar.close = 178.25;
  bar.volume = 10000.0;

  auto result = Validator::validate(bar);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("high"), std::string::npos);
}

TEST(ValidatorTest, MonotonicOrderingEnforced) {
  EventHeader prev;
  prev.ts_event_ns = 1000;
  prev.ts_receive_ns = 1100;
  prev.ts_monotonic_ns = 5000;
  prev.venue = "NASDAQ";
  prev.symbol = "AAPL";
  prev.source = "IBKR";
  prev.seq = 1;

  EventHeader current;
  current.ts_event_ns = 2000;
  current.ts_receive_ns = 2100;
  current.ts_monotonic_ns = 4900;  // Invalid: went backwards
  current.venue = "NASDAQ";
  current.symbol = "AAPL";
  current.source = "IBKR";
  current.seq = 2;

  auto result = Validator::validate_ordering(current, prev);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("monotonic"), std::string::npos);
}

TEST(ValidatorTest, SequenceOrderingEnforced) {
  EventHeader prev;
  prev.ts_event_ns = 1000;
  prev.ts_receive_ns = 1100;
  prev.ts_monotonic_ns = 5000;
  prev.venue = "NASDAQ";
  prev.symbol = "AAPL";
  prev.source = "IBKR";
  prev.seq = 10;

  EventHeader current;
  current.ts_event_ns = 2000;
  current.ts_receive_ns = 2100;
  current.ts_monotonic_ns = 6000;
  current.venue = "NASDAQ";
  current.symbol = "AAPL";
  current.source = "IBKR";
  current.seq = 10;  // Invalid: not strictly increasing

  auto result = Validator::validate_ordering(current, prev);
  EXPECT_FALSE(result.valid);
  EXPECT_NE(result.error_message.find("seq"), std::string::npos);
}

TEST(ValidatorTest, DifferentSymbolsAllowSameSeq) {
  EventHeader prev;
  prev.ts_event_ns = 1000;
  prev.ts_receive_ns = 1100;
  prev.ts_monotonic_ns = 5000;
  prev.venue = "NASDAQ";
  prev.symbol = "AAPL";
  prev.source = "IBKR";
  prev.seq = 10;

  EventHeader current;
  current.ts_event_ns = 2000;
  current.ts_receive_ns = 2100;
  current.ts_monotonic_ns = 6000;
  current.venue = "NASDAQ";
  current.symbol = "MSFT";  // Different symbol
  current.source = "IBKR";
  current.seq = 10;  // OK: different symbol

  auto result = Validator::validate_ordering(current, prev);
  EXPECT_TRUE(result.valid) << result.error_message;
}

