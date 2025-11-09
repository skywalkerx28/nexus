#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/writer.hpp"
#include "golden_dataset.hpp"
#include <gtest/gtest.h>
#include <filesystem>

using namespace nexus::eventlog;
namespace fs = std::filesystem;

class ReplayParityTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_replay_parity_test.parquet";
    fs::remove(test_file_);
  }

  void TearDown() override { fs::remove(test_file_); }

  std::string test_file_;
};

TEST_F(ReplayParityTest, GoldenDatasetRoundTrip) {
  auto golden_events = test::generate_golden_dataset();
  ASSERT_GT(golden_events.size(), 50);  // At least 50 events

  // Write events
  {
    Writer writer(test_file_);
    for (const auto& event : golden_events) {
      ASSERT_TRUE(writer.append(event));
    }
    writer.flush();
  }

  // Read events back
  std::vector<Event> read_events;
  {
    Reader reader(test_file_);
    EXPECT_EQ(reader.event_count(), golden_events.size());

    while (auto event = reader.next()) {
      read_events.push_back(*event);
    }
  }

  // Assert: events match
  ASSERT_EQ(read_events.size(), golden_events.size());

  for (size_t i = 0; i < golden_events.size(); ++i) {
    const auto& expected = golden_events[i];
    const auto& actual = read_events[i];

    // Check event type
    EXPECT_EQ(get_event_type(expected), get_event_type(actual))
        << "Event " << i << " type mismatch";

    // Check common fields
    const auto& exp_header = get_header(expected);
    const auto& act_header = get_header(actual);

    EXPECT_EQ(exp_header.ts_event_ns, act_header.ts_event_ns)
        << "Event " << i << " ts_event_ns mismatch";
    EXPECT_EQ(exp_header.ts_receive_ns, act_header.ts_receive_ns)
        << "Event " << i << " ts_receive_ns mismatch";
    EXPECT_EQ(exp_header.venue, act_header.venue) << "Event " << i << " venue mismatch";
    EXPECT_EQ(exp_header.symbol, act_header.symbol) << "Event " << i << " symbol mismatch";
    EXPECT_EQ(exp_header.source, act_header.source) << "Event " << i << " source mismatch";
    EXPECT_EQ(exp_header.seq, act_header.seq) << "Event " << i << " seq mismatch";

    // Check event-specific fields
    std::visit(
        [&](auto&& exp_event) {
          using T = std::decay_t<decltype(exp_event)>;
          auto* act_event = std::get_if<T>(&actual);
          ASSERT_NE(act_event, nullptr) << "Event " << i << " type mismatch in variant";

          if constexpr (std::is_same_v<T, DepthUpdate>) {
            EXPECT_EQ(exp_event.side, act_event->side);
            EXPECT_DOUBLE_EQ(exp_event.price, act_event->price);
            EXPECT_DOUBLE_EQ(exp_event.size, act_event->size);
            EXPECT_EQ(exp_event.level, act_event->level);
            EXPECT_EQ(exp_event.op, act_event->op);
          } else if constexpr (std::is_same_v<T, Trade>) {
            EXPECT_DOUBLE_EQ(exp_event.price, act_event->price);
            EXPECT_DOUBLE_EQ(exp_event.size, act_event->size);
            EXPECT_EQ(exp_event.aggressor, act_event->aggressor);
          } else if constexpr (std::is_same_v<T, OrderEvent>) {
            EXPECT_EQ(exp_event.order_id, act_event->order_id);
            EXPECT_EQ(exp_event.state, act_event->state);
            EXPECT_DOUBLE_EQ(exp_event.price, act_event->price);
            EXPECT_DOUBLE_EQ(exp_event.size, act_event->size);
            EXPECT_DOUBLE_EQ(exp_event.filled, act_event->filled);
            EXPECT_EQ(exp_event.reason, act_event->reason);
          } else if constexpr (std::is_same_v<T, Bar>) {
            EXPECT_EQ(exp_event.ts_open_ns, act_event->ts_open_ns);
            EXPECT_EQ(exp_event.ts_close_ns, act_event->ts_close_ns);
            EXPECT_DOUBLE_EQ(exp_event.open, act_event->open);
            EXPECT_DOUBLE_EQ(exp_event.high, act_event->high);
            EXPECT_DOUBLE_EQ(exp_event.low, act_event->low);
            EXPECT_DOUBLE_EQ(exp_event.close, act_event->close);
            EXPECT_DOUBLE_EQ(exp_event.volume, act_event->volume);
          }
        },
        expected);
  }
}

TEST_F(ReplayParityTest, ResetAndReread) {
  auto golden_events = test::generate_golden_dataset();

  // Write events
  {
    Writer writer(test_file_);
    for (const auto& event : golden_events) {
      writer.append(event);
    }
  }

  // Read, reset, read again
  Reader reader(test_file_);

  std::vector<Event> first_read;
  while (auto event = reader.next()) {
    first_read.push_back(*event);
  }

  reader.reset();

  std::vector<Event> second_read;
  while (auto event = reader.next()) {
    second_read.push_back(*event);
  }

  ASSERT_EQ(first_read.size(), second_read.size());
  EXPECT_EQ(first_read.size(), golden_events.size());
}

TEST_F(ReplayParityTest, SequenceOrdering) {
  auto golden_events = test::generate_golden_dataset();

  // Write events
  {
    Writer writer(test_file_);
    for (const auto& event : golden_events) {
      writer.append(event);
    }
  }

  // Read and verify sequence numbers are monotonic
  Reader reader(test_file_);
  uint64_t last_seq = 0;

  while (auto event = reader.next()) {
    const auto& header = get_header(*event);
    EXPECT_GT(header.seq, last_seq) << "Sequence numbers must be monotonically increasing";
    last_seq = header.seq;
  }
}

TEST_F(ReplayParityTest, TimestampOrdering) {
  auto golden_events = test::generate_golden_dataset();

  // Write events
  {
    Writer writer(test_file_);
    for (const auto& event : golden_events) {
      writer.append(event);
    }
  }

  // Read and verify timestamps are monotonic
  Reader reader(test_file_);
  int64_t last_ts = 0;

  while (auto event = reader.next()) {
    const auto& header = get_header(*event);
    EXPECT_GE(header.ts_event_ns, last_ts)
        << "Event timestamps must be monotonically non-decreasing";
    last_ts = header.ts_event_ns;
  }
}

