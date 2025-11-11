#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <filesystem>

using namespace nexus::eventlog;

class ReaderFilterTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_filter_test.parquet";
    std::filesystem::remove(test_file_);
  }

  void TearDown() override {
    std::filesystem::remove(test_file_);
  }

  std::string test_file_;
};

TEST_F(ReaderFilterTest, TimeRangeFilter) {
  // Create test data spanning 10 seconds (1000 events @ 10ms intervals)
  constexpr int64_t BASE_TS = 1700000000000000000LL; // Nov 2023
  constexpr int NUM_EVENTS = 1000;
  constexpr int64_t INTERVAL_NS = 10'000'000; // 10ms

  // Write events
  {
    Writer writer(test_file_);
    writer.set_ingest_session_id("test-session");
    writer.set_feed_mode("test");

    for (int i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = BASE_TS + i * INTERVAL_NS;
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 1000;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "AAPL";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 150.0 + (i * 0.01);
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));
    }
  }

  // Test 1: No filter - read all events
  {
    Reader reader(test_file_);
    EXPECT_EQ(reader.event_count(), NUM_EVENTS);

    int count = 0;
    while (reader.next().has_value()) {
      count++;
    }
    EXPECT_EQ(count, NUM_EVENTS);
  }

  // Test 2: Time range filter - first 25% of events
  {
    Reader reader(test_file_);
    int64_t end_ts = BASE_TS + (NUM_EVENTS / 4) * INTERVAL_NS;
    reader.set_time_range(BASE_TS, end_ts);

    int count = 0;
    int64_t min_ts = INT64_MAX, max_ts = 0;

    while (auto event = reader.next()) {
      count++;
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, *event);

      min_ts = std::min(min_ts, header.ts_event_ns);
      max_ts = std::max(max_ts, header.ts_event_ns);

      // Verify all events are within range
      EXPECT_GE(header.ts_event_ns, BASE_TS);
      EXPECT_LE(header.ts_event_ns, end_ts);
    }

    // Should get approximately 25% of events (±1 for rounding)
    EXPECT_NEAR(count, NUM_EVENTS / 4, 1);
    EXPECT_GE(min_ts, BASE_TS);
    EXPECT_LE(max_ts, end_ts);
  }

  // Test 3: Time range filter - middle 50%
  {
    Reader reader(test_file_);
    int64_t start_ts = BASE_TS + (NUM_EVENTS / 4) * INTERVAL_NS;
    int64_t end_ts = BASE_TS + (3 * NUM_EVENTS / 4) * INTERVAL_NS;
    reader.set_time_range(start_ts, end_ts);

    int count = 0;
    while (auto event = reader.next()) {
      count++;
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, *event);

      EXPECT_GE(header.ts_event_ns, start_ts);
      EXPECT_LE(header.ts_event_ns, end_ts);
    }

    EXPECT_NEAR(count, NUM_EVENTS / 2, 2);
  }

  // Test 4: Time range with no matching events (future range)
  {
    Reader reader(test_file_);
    int64_t future_start = BASE_TS + NUM_EVENTS * INTERVAL_NS + 1000000000LL;
    int64_t future_end = future_start + 1000000000LL;
    reader.set_time_range(future_start, future_end);

    int count = 0;
    while (reader.next().has_value()) {
      count++;
    }

    EXPECT_EQ(count, 0);
  }
}

TEST_F(ReaderFilterTest, SequenceRangeFilter) {
  constexpr int NUM_EVENTS = 500;
  int64_t base_ts = nexus::time::wall_ns();

  // Write events with sequential seq numbers
  {
    Writer writer(test_file_);

    for (int i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = base_ts + i * 1000;
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 100;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "MSFT";
      trade.header.source = "test";
      trade.header.seq = i + 1;  // seq: 1..500
      trade.price = 300.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::SELL;

      ASSERT_TRUE(writer.append(trade));
    }
  }

  // Test 1: Sequence range filter - first 100 events
  {
    Reader reader(test_file_);
    reader.set_seq_range(1, 100);

    int count = 0;
    uint64_t min_seq = UINT64_MAX, max_seq = 0;

    while (auto event = reader.next()) {
      count++;
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, *event);

      min_seq = std::min(min_seq, header.seq);
      max_seq = std::max(max_seq, header.seq);

      EXPECT_GE(header.seq, 1ULL);
      EXPECT_LE(header.seq, 100ULL);
    }

    EXPECT_EQ(count, 100);
    EXPECT_EQ(min_seq, 1ULL);
    EXPECT_EQ(max_seq, 100ULL);
  }

  // Test 2: Sequence range filter - specific range
  {
    Reader reader(test_file_);
    reader.set_seq_range(250, 350);

    int count = 0;
    while (auto event = reader.next()) {
      count++;
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, *event);

      EXPECT_GE(header.seq, 250ULL);
      EXPECT_LE(header.seq, 350ULL);
    }

    EXPECT_EQ(count, 101);  // Inclusive range
  }
}

TEST_F(ReaderFilterTest, CombinedFilters) {
  constexpr int NUM_EVENTS = 1000;
  constexpr int64_t BASE_TS = 1700000000000000000LL;
  constexpr int64_t INTERVAL_NS = 10'000'000;

  // Write events
  {
    Writer writer(test_file_);

    for (int i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = BASE_TS + i * INTERVAL_NS;
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 100;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "GOOGL";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 140.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));
    }
  }

  // Test combined time + sequence filters
  {
    Reader reader(test_file_);

    // Filter to middle 50% by time AND seq 400-600
    int64_t start_ts = BASE_TS + (NUM_EVENTS / 4) * INTERVAL_NS;
    int64_t end_ts = BASE_TS + (3 * NUM_EVENTS / 4) * INTERVAL_NS;
    reader.set_time_range(start_ts, end_ts);
    reader.set_seq_range(400, 600);

    int count = 0;
    while (auto event = reader.next()) {
      count++;
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, *event);

      // Must satisfy BOTH filters
      EXPECT_GE(header.ts_event_ns, start_ts);
      EXPECT_LE(header.ts_event_ns, end_ts);
      EXPECT_GE(header.seq, 400ULL);
      EXPECT_LE(header.seq, 600ULL);
    }

    // Should be intersection of both filters (seq 400-600 within middle 50%)
    // Events 251-750 by time, seq 400-600 → expect 201 events
    EXPECT_EQ(count, 201);
  }
}

TEST_F(ReaderFilterTest, FilterReset) {
  constexpr int NUM_EVENTS = 200;
  int64_t base_ts = nexus::time::wall_ns();

  // Write events
  {
    Writer writer(test_file_);

    for (int i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = base_ts + i * 1000;
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 100;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "TSLA";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 250.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));
    }
  }

  Reader reader(test_file_);

  // Apply filter, read some events
  reader.set_seq_range(1, 50);
  int count_filtered = 0;
  while (reader.next().has_value()) {
    count_filtered++;
  }
  EXPECT_EQ(count_filtered, 50);

  // Clear filters and reset
  reader.clear_filters();
  reader.reset();

  // Now should read all events
  int count_all = 0;
  while (reader.next().has_value()) {
    count_all++;
  }
  EXPECT_EQ(count_all, NUM_EVENTS);
}

TEST_F(ReaderFilterTest, RowGroupStatistics) {
  // Create large file with multiple row groups
  constexpr int EVENTS_PER_GROUP = 100000;
  constexpr int NUM_GROUPS = 5;
  constexpr int TOTAL_EVENTS = EVENTS_PER_GROUP * NUM_GROUPS;
  constexpr int64_t BASE_TS = 1700000000000000000LL;

  {
    Writer writer(test_file_);

    for (int i = 0; i < TOTAL_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = BASE_TS + i * 1000000LL; // 1ms intervals
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 1000;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "AMZN";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 170.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));

      // Flush every EVENTS_PER_GROUP to create new row groups
      if ((i + 1) % EVENTS_PER_GROUP == 0) {
        writer.flush();
      }
    }
  }

  Reader reader(test_file_);

  // Verify row groups were created
  int row_group_count = reader.row_group_count();
  std::cout << "Row groups created: " << row_group_count << std::endl;
  EXPECT_GT(row_group_count, 0);
  EXPECT_LE(row_group_count, NUM_GROUPS + 1); // May have +1 for final flush

  // Test statistics-based pruning effectiveness
  // Query first row group only (should be fast)
  int64_t first_group_end = BASE_TS + EVENTS_PER_GROUP * 1000000LL;
  reader.set_time_range(BASE_TS, first_group_end);

  int count = 0;
  while (reader.next().has_value()) {
    count++;
  }

  // Should read approximately first row group
  EXPECT_NEAR(count, EVENTS_PER_GROUP, 100);
  std::cout << "Events read from first row group: " << count << std::endl;
}

TEST_F(ReaderFilterTest, EdgeCases) {
  int64_t base_ts = nexus::time::wall_ns();

  // Write single event
  {
    Writer writer(test_file_);

    Trade trade;
    trade.header.ts_event_ns = base_ts;
    trade.header.ts_receive_ns = base_ts + 1000;
    trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
    trade.header.venue = "TEST";
    trade.header.symbol = "NVDA";
    trade.header.source = "test";
    trade.header.seq = 42;
    trade.price = 500.0;
    trade.size = 10.0;
    trade.aggressor = Aggressor::BUY;

    ASSERT_TRUE(writer.append(trade));
  }

  Reader reader(test_file_);

  // Test 1: Exact match
  reader.set_time_range(base_ts, base_ts);
  reader.set_seq_range(42, 42);
  EXPECT_TRUE(reader.next().has_value());
  EXPECT_FALSE(reader.next().has_value());

  // Test 2: Range excludes event (before)
  reader.clear_filters();
  reader.reset();
  reader.set_time_range(base_ts - 10000, base_ts - 1);
  EXPECT_FALSE(reader.next().has_value());

  // Test 3: Range excludes event (after)
  reader.clear_filters();
  reader.reset();
  reader.set_time_range(base_ts + 1, base_ts + 10000);
  EXPECT_FALSE(reader.next().has_value());

  // Test 4: Seq range excludes event
  reader.clear_filters();
  reader.reset();
  reader.set_seq_range(1, 41);
  EXPECT_FALSE(reader.next().has_value());
}

