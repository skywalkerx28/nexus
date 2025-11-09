#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include <gtest/gtest.h>
#include <filesystem>

using namespace nexus::eventlog;
namespace fs = std::filesystem;

class EventLogTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_test_eventlog.dat";
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
    hb.header.ts_event_ns = 1000;
    hb.header.ts_receive_ns = 1100;
    hb.header.venue = "TEST";
    hb.header.symbol = "AAPL";
    hb.header.source = "test";
    hb.header.seq = 1;

    EXPECT_TRUE(writer.append(hb));
    EXPECT_EQ(writer.event_count(), 1);

    EXPECT_TRUE(writer.append(hb));
    EXPECT_EQ(writer.event_count(), 2);
  }
  EXPECT_TRUE(fs::exists(test_file_));
}

TEST_F(EventLogTest, ReaderOpensFile) {
  {
    Writer writer(test_file_);
    Heartbeat hb;
    hb.header.seq = 1;
    writer.append(hb);
  }

  Reader reader(test_file_);
  // Basic smoke test - full read/replay parity will be implemented with Arrow
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

