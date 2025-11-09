#include "nexus/eventlog/partitioner.hpp"
#include <gtest/gtest.h>

using namespace nexus::eventlog;

TEST(PartitionerTest, GenerateCanonicalPath) {
  // 2025-01-09 00:00:00 UTC
  int64_t ts_ns = 1736380800'000000000L;

  auto path = Partitioner::get_path("/data/parquet", "AAPL", ts_ns);
  EXPECT_EQ(path, "/data/parquet/AAPL/2025/01/09.parquet");
}

TEST(PartitionerTest, GeneratePathFromComponents) {
  auto path = Partitioner::get_path("/data/parquet", "MSFT", 2025, 1, 15);
  EXPECT_EQ(path, "/data/parquet/MSFT/2025/01/15.parquet");
}

TEST(PartitionerTest, ExtractSymbol) {
  std::string path = "/data/parquet/AAPL/2025/01/09.parquet";
  auto symbol = Partitioner::extract_symbol(path);
  EXPECT_EQ(symbol, "AAPL");
}

TEST(PartitionerTest, ExtractSymbolInvalid) {
  std::string path = "/data/invalid/path.parquet";
  auto symbol = Partitioner::extract_symbol(path);
  EXPECT_EQ(symbol, "");
}

TEST(PartitionerTest, ExtractDate) {
  std::string path = "/data/parquet/AAPL/2025/01/09.parquet";
  auto date = Partitioner::extract_date(path);
  EXPECT_EQ(date.year, 2025);
  EXPECT_EQ(date.month, 1);
  EXPECT_EQ(date.day, 9);
}

TEST(PartitionerTest, ExtractDateInvalid) {
  std::string path = "/data/invalid/path.parquet";
  auto date = Partitioner::extract_date(path);
  EXPECT_EQ(date.year, 0);
  EXPECT_EQ(date.month, 0);
  EXPECT_EQ(date.day, 0);
}

TEST(PartitionerTest, TimestampToDate) {
  // 2025-01-09 12:34:56 UTC
  int64_t ts_ns = 1736426096'000000000L;

  auto path = Partitioner::get_path("/data", "SPY", ts_ns);

  // Should extract to 2025-01-09
  auto date = Partitioner::extract_date(path);
  EXPECT_EQ(date.year, 2025);
  EXPECT_EQ(date.month, 1);
  EXPECT_EQ(date.day, 9);
}

TEST(PartitionerTest, DifferentSymbolsSeparatePaths) {
  int64_t ts_ns = 1736380800'000000000L;  // 2025-01-09

  auto path1 = Partitioner::get_path("/data", "AAPL", ts_ns);
  auto path2 = Partitioner::get_path("/data", "MSFT", ts_ns);

  EXPECT_NE(path1, path2);
  EXPECT_NE(path1.find("AAPL"), std::string::npos);
  EXPECT_NE(path2.find("MSFT"), std::string::npos);
}

TEST(PartitionerTest, DifferentDatesSeparatePaths) {
  int64_t ts1 = 1736380800'000000000L;  // 2025-01-09
  int64_t ts2 = 1736467200'000000000L;  // 2025-01-10

  auto path1 = Partitioner::get_path("/data", "AAPL", ts1);
  auto path2 = Partitioner::get_path("/data", "AAPL", ts2);

  EXPECT_NE(path1, path2);
  EXPECT_NE(path1.find("/09.parquet"), std::string::npos);
  EXPECT_NE(path2.find("/10.parquet"), std::string::npos);
}

