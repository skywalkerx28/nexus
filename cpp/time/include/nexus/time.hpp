#pragma once

#include <chrono>
#include <cstdint>
#include <string>

namespace nexus::time {

using namespace std::chrono;

// Type aliases for clarity
using Nanoseconds = int64_t;
using Timestamp = time_point<steady_clock>;
using WallTimestamp = time_point<system_clock>;

/**
 * Get monotonic timestamp in nanoseconds since epoch.
 * Use for latency measurements and ordering.
 */
inline Nanoseconds monotonic_ns() {
  return duration_cast<nanoseconds>(steady_clock::now().time_since_epoch()).count();
}

/**
 * Get wall-clock timestamp in nanoseconds since Unix epoch.
 * Use for logging and human-readable timestamps.
 */
inline Nanoseconds wall_ns() {
  return duration_cast<nanoseconds>(system_clock::now().time_since_epoch()).count();
}

/**
 * Convert nanoseconds to ISO 8601 string (UTC).
 */
std::string to_iso8601(Nanoseconds ns);

/**
 * Convert ISO 8601 string to nanoseconds.
 * Returns 0 on parse failure.
 */
Nanoseconds from_iso8601(const std::string& iso);

/**
 * Validate that monotonic timestamp is reasonable (not zero, not in future beyond tolerance).
 */
inline bool is_valid_monotonic(Nanoseconds ts, Nanoseconds tolerance_ns = 1'000'000'000) {
  if (ts <= 0) return false;
  Nanoseconds now = monotonic_ns();
  return ts <= now + tolerance_ns;
}

/**
 * Validate wall-clock timestamp (within reasonable bounds: 2020-2050).
 */
inline bool is_valid_wall(Nanoseconds ts) {
  constexpr Nanoseconds MIN_WALL = 1577836800'000'000'000L;  // 2020-01-01
  constexpr Nanoseconds MAX_WALL = 2524608000'000'000'000L;  // 2050-01-01
  return ts >= MIN_WALL && ts <= MAX_WALL;
}

}  // namespace nexus::time

