#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <filesystem>
#include <iostream>

using namespace nexus::eventlog;

class IOPruningTest : public ::testing::Test {
 protected:
  void SetUp() override {
    test_file_ = "/tmp/nexus_io_pruning_test.parquet";
    std::filesystem::remove(test_file_);
  }

  void TearDown() override {
    std::filesystem::remove(test_file_);
  }

  std::string test_file_;
};

TEST_F(IOPruningTest, VerifyRowGroupSkipping) {
  // Create file with multiple row groups
  // Row groups are determined by max_row_group_length (250k in writer.cpp)
  // We write 600k events to guarantee at least 2 row groups
  constexpr int TOTAL_EVENTS = 600000;
  constexpr int64_t BASE_TS = 1700000000000000000LL;
  constexpr int64_t TIME_SPAN = 6000000000000LL;  // Total time span

  std::cout << "\n=== IO Pruning Test ===" << std::endl;
  std::cout << "Writing " << TOTAL_EVENTS << " events to create multiple row groups..." << std::endl;

  // Write data continuously (row groups created automatically by max_row_group_length)
  {
    Writer writer(test_file_);
    writer.set_ingest_session_id("io-pruning-test");
    writer.set_feed_mode("test");

    for (int i = 0; i < TOTAL_EVENTS; ++i) {
      Trade trade;
      // Distribute events evenly across time span
      trade.header.ts_event_ns = BASE_TS + (i * TIME_SPAN / TOTAL_EVENTS);
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 1000;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "AAPL";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 150.0 + (i / 100000) * 10.0;  // Price changes by group
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));
      
      if ((i + 1) % 100000 == 0) {
        std::cout << "  Written " << (i + 1) << "/" << TOTAL_EVENTS << " events" << std::endl;
      }
    }
  }

  // Verify file structure
  Reader reader(test_file_);
  int total_groups = reader.row_group_count();
  std::cout << "\nFile created with " << total_groups << " row groups" << std::endl;
  ASSERT_GE(total_groups, 2) << "Expected at least 2 row groups for 600k events";
  
  // Calculate time per group for testing
  int64_t time_per_group = TIME_SPAN / total_groups;

  // Test 1: Read first group only (should touch only 1 row group)
  {
    std::cout << "\n--- Test 1: Query first row group only ---" << std::endl;
    Reader test_reader(test_file_);
    
    int64_t query_start = BASE_TS;
    int64_t query_end = BASE_TS + time_per_group - 1;
    test_reader.set_time_range(query_start, query_end);
    
    int event_count = 0;
    while (test_reader.next().has_value()) {
      event_count++;
    }
    
    int groups_touched = test_reader.row_groups_touched();
    std::cout << "Events read: " << event_count << std::endl;
    std::cout << "Row groups touched: " << groups_touched << " / " << total_groups << std::endl;
    
    // Verify IO-level pruning: should only touch 1 row group
    EXPECT_EQ(groups_touched, 1) << "Expected to touch only 1 row group";
  }

  // Test 2: Query outside all row groups
  {
    std::cout << "\n--- Test 2: Query outside all row groups ---" << std::endl;
    Reader test_reader2(test_file_);
    
    int64_t query_start = BASE_TS + TIME_SPAN + 1000000000LL;
    int64_t query_end = query_start + 1000000000LL;
    test_reader2.set_time_range(query_start, query_end);
    
    int event_count = 0;
    while (test_reader2.next().has_value()) {
      event_count++;
    }
    
    int groups_touched = test_reader2.row_groups_touched();
    std::cout << "Events read: " << event_count << std::endl;
    std::cout << "Row groups touched: " << groups_touched << std::endl;
    
    EXPECT_EQ(groups_touched, 0) << "Should skip all row groups";
    EXPECT_EQ(event_count, 0);
  }

  // Test 3: Read all (no filter) - baseline
  {
    std::cout << "\n--- Test 3: Full scan (no filter) ---" << std::endl;
    Reader test_reader3(test_file_);
    
    int event_count = 0;
    while (test_reader3.next().has_value()) {
      event_count++;
    }
    
    int groups_touched = test_reader3.row_groups_touched();
    std::cout << "Events read: " << event_count << std::endl;
    std::cout << "Row groups touched: " << groups_touched << " / " << total_groups << std::endl;
    
    // Should read all groups when no filter
    EXPECT_EQ(groups_touched, total_groups);
    EXPECT_EQ(event_count, TOTAL_EVENTS);
  }

  std::cout << "\n=== IO Pruning Test Complete ===" << std::endl;
  std::cout << "Verified selective row-group reading" << std::endl;
  std::cout << "Confirmed IO-level skipping (no wasted decoding)" << std::endl;
}

TEST_F(IOPruningTest, PruningEfficiency) {
  // Write enough events to create multiple row groups (750k = 3 groups @ 250k each)
  constexpr int TOTAL_EVENTS = 750000;
  constexpr int64_t BASE_TS = 1700000000000000000LL;
  constexpr int64_t TIME_SPAN = 7500000000000LL;

  {
    Writer writer(test_file_);
    writer.set_ingest_session_id("efficiency-test");
    
    for (int i = 0; i < TOTAL_EVENTS; ++i) {
      Trade trade;
      trade.header.ts_event_ns = BASE_TS + (i * TIME_SPAN / TOTAL_EVENTS);
      trade.header.ts_receive_ns = trade.header.ts_event_ns + 1000;
      trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();
      trade.header.venue = "TEST";
      trade.header.symbol = "MSFT";
      trade.header.source = "test";
      trade.header.seq = i + 1;
      trade.price = 300.0;
      trade.size = 100.0;
      trade.aggressor = Aggressor::BUY;

      ASSERT_TRUE(writer.append(trade));
    }
  }

  Reader reader(test_file_);
  int total_groups = reader.row_group_count();
  
  // Query first third (should touch only 1 group)
  int64_t query_start = BASE_TS;
  int64_t query_end = BASE_TS + (TIME_SPAN / 3);
  reader.set_time_range(query_start, query_end);
  
  int event_count = 0;
  while (reader.next().has_value()) {
    event_count++;
  }
  
  int groups_touched = reader.row_groups_touched();
  EXPECT_GT(event_count, 0) << "Should have read some events";
  
  std::cout << "\nPruning Efficiency Test:" << std::endl;
  std::cout << "  Total row groups: " << total_groups << std::endl;
  std::cout << "  Groups touched: " << groups_touched << std::endl;
  std::cout << "  Events read: " << event_count << " / " << TOTAL_EVENTS << std::endl;
  
  if (total_groups > 1) {
    double skip_ratio = (double)(total_groups - groups_touched) / total_groups;
    std::cout << "  Pruning ratio: " << (100.0 * skip_ratio) << "% skipped" << std::endl;
    EXPECT_GT(skip_ratio, 0.3) << "Should skip at least 30% of row groups";
  }
  
  // Verify we touched fewer groups than total
  EXPECT_LT(groups_touched, total_groups) << "Should not read all row groups";
}

