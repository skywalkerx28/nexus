#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <filesystem>

using namespace nexus::eventlog;
namespace fs = std::filesystem;

class LargeFileTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_large_file_test.parquet";
    fs::remove(test_file_);
  }

  void TearDown() override { fs::remove(test_file_); }

  std::string test_file_;
};

TEST_F(LargeFileTest, WriteAndReadLargeFile) {
  // Write 50,000 events (5 batches of 10k each)
  constexpr size_t NUM_EVENTS = 50000;
  int64_t base_ts = nexus::time::wall_ns();

  {
    Writer writer(test_file_);

    for (size_t i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = base_ts + i * 1000;
      trade.header.ts_receive_ns = base_ts + i * 1000 + 100;
      trade.header.ts_monotonic_ns = base_ts + i * 1000 + 50;
      trade.header.venue = "TEST";
      trade.header.symbol = (i % 3 == 0) ? "AAPL" : (i % 3 == 1) ? "MSFT" : "SPY";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 100.0 + (i % 100) * 0.01;
      trade.size = 100.0;
      trade.aggressor = (i % 2 == 0) ? Aggressor::BUY : Aggressor::SELL;

      ASSERT_TRUE(writer.append(trade)) << "Failed to append event " << i;
    }

    writer.flush();
  }

  // Read all events back
  {
    Reader reader(test_file_);
    EXPECT_EQ(reader.event_count(), NUM_EVENTS);

    size_t count = 0;
    uint64_t last_seq = 0;

    while (auto event = reader.next()) {
      count++;

      const auto& header = get_header(*event);

      // Verify sequence ordering
      EXPECT_GT(header.seq, last_seq) << "Sequence not monotonic at event " << count;
      last_seq = header.seq;

      // Verify event type
      EXPECT_EQ(get_event_type(*event), EventType::TRADE) << "Wrong event type at " << count;

      // Spot check some events
      if (count == 1) {
        EXPECT_EQ(header.seq, 1);
        EXPECT_EQ(header.symbol, "AAPL");
      } else if (count == NUM_EVENTS / 2) {
        EXPECT_EQ(header.seq, NUM_EVENTS / 2);
      } else if (count == NUM_EVENTS) {
        EXPECT_EQ(header.seq, NUM_EVENTS);
        EXPECT_EQ(header.symbol, "MSFT");  // 49999 % 3 == 1
      }
    }

    EXPECT_EQ(count, NUM_EVENTS) << "Did not read all events";
  }
}

TEST_F(LargeFileTest, ResetAndRereadLargeFile) {
  constexpr size_t NUM_EVENTS = 20000;
  int64_t base_ts = nexus::time::wall_ns();

  // Write events
  {
    Writer writer(test_file_);
    for (size_t i = 0; i < NUM_EVENTS; ++i) {
      Heartbeat hb;
      hb.header.ts_event_ns = base_ts + i;
      hb.header.ts_receive_ns = base_ts + i + 1;
      hb.header.ts_monotonic_ns = base_ts + i;
      hb.header.venue = "TEST";
      hb.header.symbol = "AAPL";
      hb.header.source = "test";
      hb.header.seq = i + 1;
      writer.append(hb);
    }
  }

  // Read, reset, read again
  Reader reader(test_file_);

  size_t first_pass = 0;
  while (reader.next()) {
    first_pass++;
  }
  EXPECT_EQ(first_pass, NUM_EVENTS);

  reader.reset();

  size_t second_pass = 0;
  while (reader.next()) {
    second_pass++;
  }
  EXPECT_EQ(second_pass, NUM_EVENTS);
}

TEST_F(LargeFileTest, MultipleFlushes) {
  // Test writer with multiple explicit flushes
  constexpr size_t EVENTS_PER_FLUSH = 5000;
  constexpr size_t NUM_FLUSHES = 6;
  constexpr size_t TOTAL_EVENTS = EVENTS_PER_FLUSH * NUM_FLUSHES;
  int64_t base_ts = nexus::time::wall_ns();

  {
    Writer writer(test_file_);

    for (size_t flush = 0; flush < NUM_FLUSHES; ++flush) {
      for (size_t i = 0; i < EVENTS_PER_FLUSH; ++i) {
        size_t event_idx = flush * EVENTS_PER_FLUSH + i;
        Trade trade;
        trade.header.ts_event_ns = base_ts + event_idx * 1000;
        trade.header.ts_receive_ns = base_ts + event_idx * 1000 + 100;
        trade.header.ts_monotonic_ns = base_ts + event_idx * 1000 + 50;
        trade.header.venue = "TEST";
        trade.header.symbol = "AAPL";
        trade.header.source = "test";
        trade.header.seq = event_idx + 1;
        trade.price = 100.0;
        trade.size = 100.0;
        trade.aggressor = Aggressor::BUY;

        ASSERT_TRUE(writer.append(trade)) << "Failed at event " << event_idx;
      }
      writer.flush();  // Explicit flush after each batch
    }
  }

  // Verify all events readable
  Reader reader(test_file_);
  EXPECT_EQ(reader.event_count(), TOTAL_EVENTS);

  size_t count = 0;
  while (reader.next()) {
    count++;
  }
  EXPECT_EQ(count, TOTAL_EVENTS);
}

TEST_F(LargeFileTest, MemoryBounded) {
  // This test ensures memory doesn't grow unbounded with large files
  // We write 100k events but reader should only hold one batch in memory
  constexpr size_t NUM_EVENTS = 100000;
  int64_t base_ts = nexus::time::wall_ns();

  {
    Writer writer(test_file_);
    for (size_t i = 0; i < NUM_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = base_ts + i;
      trade.header.ts_receive_ns = base_ts + i + 1;
      trade.header.ts_monotonic_ns = base_ts + i;
      trade.header.venue = "TEST";
      trade.header.symbol = "AAPL";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 100.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;
      writer.append(trade);
    }
  }

  // Read sequentially - memory should stay bounded
  Reader reader(test_file_);
  size_t count = 0;
  while (reader.next()) {
    count++;
    // In a real test, we'd measure RSS here
    // For now, just verify we can read all events without crashing
  }
  EXPECT_EQ(count, NUM_EVENTS);
}

