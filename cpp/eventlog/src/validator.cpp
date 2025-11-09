#include "nexus/eventlog/validator.hpp"
#include <sstream>

namespace nexus::eventlog {

ValidationResult Validator::validate(const Event& event) {
  // Validate common header
  const auto& header = get_header(event);
  auto header_result = validate_header(header);
  if (!header_result.valid) {
    return header_result;
  }

  // Validate event-specific fields
  return std::visit(
      [](auto&& arg) -> ValidationResult {
        using T = std::decay_t<decltype(arg)>;
        if constexpr (std::is_same_v<T, DepthUpdate>) {
          return validate_depth_update(arg);
        } else if constexpr (std::is_same_v<T, Trade>) {
          return validate_trade(arg);
        } else if constexpr (std::is_same_v<T, OrderEvent>) {
          return validate_order_event(arg);
        } else if constexpr (std::is_same_v<T, Bar>) {
          return validate_bar(arg);
        } else {
          return ValidationResult::ok();  // Heartbeat has no extra fields
        }
      },
      event);
}

ValidationResult Validator::validate_header(const EventHeader& header) {
  // Validate ts_event_ns (wall-clock)
  if (header.ts_event_ns < MIN_WALL_NS || header.ts_event_ns > MAX_WALL_NS) {
    std::ostringstream oss;
    oss << "ts_event_ns out of bounds: " << header.ts_event_ns
        << " (must be in [2020, 2050])";
    return ValidationResult::error(oss.str());
  }

  // Validate ts_receive_ns (wall-clock)
  if (header.ts_receive_ns < MIN_WALL_NS || header.ts_receive_ns > MAX_WALL_NS) {
    std::ostringstream oss;
    oss << "ts_receive_ns out of bounds: " << header.ts_receive_ns
        << " (must be in [2020, 2050])";
    return ValidationResult::error(oss.str());
  }

  // Validate receive time vs event time (allow 60s clock skew)
  if (header.ts_receive_ns < header.ts_event_ns - MAX_CLOCK_SKEW_NS) {
    std::ostringstream oss;
    oss << "ts_receive_ns (" << header.ts_receive_ns << ") is too far before ts_event_ns ("
        << header.ts_event_ns << "), clock skew > 60s";
    return ValidationResult::error(oss.str());
  }

  // Validate sequence number
  if (header.seq == 0) {
    return ValidationResult::error("seq must be > 0");
  }

  // Validate non-empty strings
  if (header.venue.empty()) {
    return ValidationResult::error("venue cannot be empty");
  }
  if (header.symbol.empty()) {
    return ValidationResult::error("symbol cannot be empty");
  }
  if (header.source.empty()) {
    return ValidationResult::error("source cannot be empty");
  }

  return ValidationResult::ok();
}

ValidationResult Validator::validate_ordering(const EventHeader& current,
                                              const EventHeader& previous) {
  // Check monotonic timestamp ordering
  if (current.ts_monotonic_ns < previous.ts_monotonic_ns) {
    std::ostringstream oss;
    oss << "ts_monotonic_ns not monotonic: " << current.ts_monotonic_ns << " < "
        << previous.ts_monotonic_ns;
    return ValidationResult::error(oss.str());
  }

  // Check sequence ordering (if same source and symbol)
  if (current.source == previous.source && current.symbol == previous.symbol) {
    if (current.seq <= previous.seq) {
      std::ostringstream oss;
      oss << "seq not strictly increasing for (" << current.source << ", " << current.symbol
          << "): " << current.seq << " <= " << previous.seq;
      return ValidationResult::error(oss.str());
    }
  }

  return ValidationResult::ok();
}

ValidationResult Validator::validate_depth_update(const DepthUpdate& event) {
  // Validate level
  if (event.level >= 1000) {
    std::ostringstream oss;
    oss << "level too large: " << event.level << " (must be < 1000)";
    return ValidationResult::error(oss.str());
  }

  // Validate price (allow zero for DELETE operations)
  if (event.op != DepthOp::DELETE) {
    if (!is_finite_positive(event.price)) {
      std::ostringstream oss;
      oss << "price must be finite and positive: " << event.price;
      return ValidationResult::error(oss.str());
    }
  } else {
    if (!is_finite_non_negative(event.price)) {
      std::ostringstream oss;
      oss << "price must be finite and non-negative: " << event.price;
      return ValidationResult::error(oss.str());
    }
  }

  // Validate size
  if (!is_finite_non_negative(event.size)) {
    std::ostringstream oss;
    oss << "size must be finite and non-negative: " << event.size;
    return ValidationResult::error(oss.str());
  }

  return ValidationResult::ok();
}

ValidationResult Validator::validate_trade(const Trade& event) {
  // Validate price
  if (!is_finite_positive(event.price)) {
    std::ostringstream oss;
    oss << "trade price must be finite and positive: " << event.price;
    return ValidationResult::error(oss.str());
  }

  // Validate size
  if (!is_finite_positive(event.size)) {
    std::ostringstream oss;
    oss << "trade size must be finite and positive: " << event.size;
    return ValidationResult::error(oss.str());
  }

  return ValidationResult::ok();
}

ValidationResult Validator::validate_order_event(const OrderEvent& event) {
  // Validate order_id
  if (event.order_id.empty()) {
    return ValidationResult::error("order_id cannot be empty");
  }

  // Validate price
  if (!is_finite_non_negative(event.price)) {
    std::ostringstream oss;
    oss << "order price must be finite and non-negative: " << event.price;
    return ValidationResult::error(oss.str());
  }

  // Validate size
  if (!is_finite_positive(event.size)) {
    std::ostringstream oss;
    oss << "order size must be finite and positive: " << event.size;
    return ValidationResult::error(oss.str());
  }

  // Validate filled
  if (!is_finite_non_negative(event.filled)) {
    std::ostringstream oss;
    oss << "filled must be finite and non-negative: " << event.filled;
    return ValidationResult::error(oss.str());
  }

  // Validate filled <= size
  if (event.filled > event.size) {
    std::ostringstream oss;
    oss << "filled (" << event.filled << ") cannot exceed size (" << event.size << ")";
    return ValidationResult::error(oss.str());
  }

  return ValidationResult::ok();
}

ValidationResult Validator::validate_bar(const Bar& event) {
  // Validate timestamp ordering
  if (event.ts_close_ns <= event.ts_open_ns) {
    std::ostringstream oss;
    oss << "ts_close_ns (" << event.ts_close_ns << ") must be > ts_open_ns ("
        << event.ts_open_ns << ")";
    return ValidationResult::error(oss.str());
  }

  // Validate OHLC values
  if (!is_finite_positive(event.open) || !is_finite_positive(event.high) ||
      !is_finite_positive(event.low) || !is_finite_positive(event.close)) {
    return ValidationResult::error("OHLC values must be finite and positive");
  }

  // Validate high >= low
  if (event.high < event.low) {
    std::ostringstream oss;
    oss << "high (" << event.high << ") must be >= low (" << event.low << ")";
    return ValidationResult::error(oss.str());
  }

  // Validate high >= open, close
  if (event.high < event.open || event.high < event.close) {
    return ValidationResult::error("high must be >= open and close");
  }

  // Validate low <= open, close
  if (event.low > event.open || event.low > event.close) {
    return ValidationResult::error("low must be <= open and close");
  }

  // Validate volume
  if (!is_finite_non_negative(event.volume)) {
    std::ostringstream oss;
    oss << "volume must be finite and non-negative: " << event.volume;
    return ValidationResult::error(oss.str());
  }

  return ValidationResult::ok();
}

}  // namespace nexus::eventlog

