#pragma once

#include "nexus/eventlog/schema.hpp"
#include <cmath>
#include <optional>
#include <string>

namespace nexus::eventlog {

/**
 * Validation result with optional error message.
 */
struct ValidationResult {
  bool valid;
  std::string error_message;

  static ValidationResult ok() { return {true, ""}; }
  static ValidationResult error(const std::string& msg) { return {false, msg}; }
};

/**
 * Validator for EventLog invariants.
 * Enforces data quality rules at write time.
 */
class Validator {
 public:
  /**
   * Validate an event before writing.
   * Returns ValidationResult with error message if invalid.
   */
  static ValidationResult validate(const Event& event);

  /**
   * Validate common header fields.
   */
  static ValidationResult validate_header(const EventHeader& header);

  /**
   * Validate timestamp ordering within a session.
   * Call this with previous event's header to check monotonicity.
   */
  static ValidationResult validate_ordering(const EventHeader& current,
                                            const EventHeader& previous);

 private:
  // Timestamp bounds (ns since Unix epoch)
  static constexpr int64_t MIN_WALL_NS = 1577836800'000'000'000L;  // 2020-01-01
  static constexpr int64_t MAX_WALL_NS = 2524608000'000'000'000L;  // 2050-01-01

  static constexpr int64_t MAX_CLOCK_SKEW_NS = 60'000'000'000L;  // 60 seconds

  static bool is_finite_positive(double value) {
    return std::isfinite(value) && value > 0.0;
  }

  static bool is_finite_non_negative(double value) {
    return std::isfinite(value) && value >= 0.0;
  }

  static ValidationResult validate_depth_update(const DepthUpdate& event);
  static ValidationResult validate_trade(const Trade& event);
  static ValidationResult validate_order_event(const OrderEvent& event);
  static ValidationResult validate_bar(const Bar& event);
};

}  // namespace nexus::eventlog

