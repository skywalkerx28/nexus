#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <filesystem>

using namespace nexus::eventlog;
namespace fs = std::filesystem;

class EventLogTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_test_eventlog.parquet";
    fs::remove(test_file_);
  }

  void TearDown() override { fs::remove(test_file_); }

  std::string test_file_;
};

TEST_F(EventLogTest, WriterCreatesFile) {
  Writer writer(test_file_);
  EXPECT_TRUE(fs::exists(test_file_));
}

TEST_F(EventLogTest, WriteAndCount) {
  {
    Writer writer(test_file_);
    Heartbeat hb;
    hb.header.ts_event_ns = nexus::time::wall_ns();
    hb.header.ts_receive_ns = nexus::time::wall_ns();
    hb.header.ts_monotonic_ns = nexus::time::monotonic_ns();
    hb.header.venue = "TEST";
    hb.header.symbol = "AAPL";
    hb.header.source = "test";
    hb.header.seq = 1;

    EXPECT_TRUE(writer.append(hb));
    EXPECT_EQ(writer.event_count(), 1);

    hb.header.seq = 2;
    hb.header.ts_monotonic_ns = nexus::time::monotonic_ns();
    EXPECT_TRUE(writer.append(hb));
    EXPECT_EQ(writer.event_count(), 2);
  }
  EXPECT_TRUE(fs::exists(test_file_));
}

TEST_F(EventLogTest, ReaderOpensFile) {
  {
    Writer writer(test_file_);
    Heartbeat hb;
    hb.header.ts_event_ns = nexus::time::wall_ns();
    hb.header.ts_receive_ns = nexus::time::wall_ns();
    hb.header.ts_monotonic_ns = nexus::time::monotonic_ns();
    hb.header.venue = "TEST";
    hb.header.symbol = "AAPL";
    hb.header.source = "test";
    hb.header.seq = 1;
    writer.append(hb);
  }

  Reader reader(test_file_);
  EXPECT_EQ(reader.event_count(), 1);
}

TEST_F(EventLogTest, EventTypeHelpers) {
  Heartbeat hb;
  Event event = hb;
  EXPECT_EQ(get_event_type(event), EventType::HEARTBEAT);

  Trade trade;
  trade.header.seq = 1;
  event = trade;
  EXPECT_EQ(get_event_type(event), EventType::TRADE);
}

TEST_F(EventLogTest, ValidationErrorsTracked) {
  Writer writer(test_file_);

  // Valid event
  Trade valid;
  valid.header.ts_event_ns = nexus::time::wall_ns();
  valid.header.ts_receive_ns = nexus::time::wall_ns();
  valid.header.ts_monotonic_ns = nexus::time::monotonic_ns();
  valid.header.venue = "TEST";
  valid.header.symbol = "AAPL";
  valid.header.source = "test";
  valid.header.seq = 1;
  valid.price = 100.0;
  valid.size = 100.0;
  valid.aggressor = Aggressor::BUY;

  EXPECT_TRUE(writer.append(valid));
  EXPECT_EQ(writer.validation_errors(), 0);

  // Invalid event (negative price)
  Trade invalid = valid;
  invalid.header.seq = 2;
  invalid.price = -100.0;

  EXPECT_FALSE(writer.append(invalid));
  EXPECT_EQ(writer.validation_errors(), 1);
}

