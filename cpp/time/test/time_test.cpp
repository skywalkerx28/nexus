#include "nexus/time.hpp"
#include <gtest/gtest.h>
#include <thread>

using namespace nexus::time;

TEST(TimeTest, MonotonicIncreases) {
  auto t1 = monotonic_ns();
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  auto t2 = monotonic_ns();
  EXPECT_GT(t2, t1);
  EXPECT_LT(t2 - t1, 100'000'000);  // Less than 100ms
}

TEST(TimeTest, WallClockReasonable) {
  auto t = wall_ns();
  EXPECT_TRUE(is_valid_wall(t));
}

TEST(TimeTest, ISO8601RoundTrip) {
  Nanoseconds original = 1609459200'123456789L;  // 2021-01-01T00:00:00.123456789Z
  std::string iso = to_iso8601(original);
  EXPECT_EQ(iso, "2021-01-01T00:00:00.123456789Z");

  Nanoseconds parsed = from_iso8601(iso);
  EXPECT_EQ(parsed, original);
}

TEST(TimeTest, ISO8601ParseInvalid) {
  EXPECT_EQ(from_iso8601("invalid"), 0);
  EXPECT_EQ(from_iso8601("2021-13-01T00:00:00.000000000Z"), 0);
}

TEST(TimeTest, ValidateMonotonic) {
  auto now = monotonic_ns();
  EXPECT_TRUE(is_valid_monotonic(now));
  EXPECT_FALSE(is_valid_monotonic(0));
  EXPECT_FALSE(is_valid_monotonic(-1));
  EXPECT_TRUE(is_valid_monotonic(now + 100'000'000));  // 100ms in future (within tolerance)
}

TEST(TimeTest, ValidateWall) {
  EXPECT_TRUE(is_valid_wall(1609459200'000000000L));   // 2021-01-01
  EXPECT_FALSE(is_valid_wall(946684800'000000000L));   // 2000-01-01 (too old)
  EXPECT_FALSE(is_valid_wall(2556144000'000000000L));  // 2051-01-01 (too far future)
}

