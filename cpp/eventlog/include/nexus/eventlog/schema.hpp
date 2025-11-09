#pragma once

#include <cstdint>
#include <string>
#include <variant>
#include <vector>

namespace nexus::eventlog {

// Event types
enum class EventType : uint8_t {
  DEPTH_UPDATE = 1,
  TRADE = 2,
  ORDER_EVENT = 3,
  BAR = 4,
  HEARTBEAT = 5,
};

enum class Side : uint8_t { BID = 0, ASK = 1 };

enum class DepthOp : uint8_t { ADD = 0, UPDATE = 1, DELETE = 2 };

enum class Aggressor : uint8_t { BUY = 0, SELL = 1, UNKNOWN = 2 };

enum class OrderState : uint8_t {
  NEW = 0,
  ACK = 1,
  REPLACED = 2,
  CANCELED = 3,
  FILLED = 4,
  REJECTED = 5,
};

// Common fields for all events
struct EventHeader {
  int64_t ts_event_ns;       // Event timestamp (exchange/source time, wall-clock)
  int64_t ts_receive_ns;     // Receive timestamp (wall-clock, for audit/replay)
  int64_t ts_monotonic_ns;   // Monotonic timestamp (for latency measurement)
  std::string venue;
  std::string symbol;
  std::string source;
  uint64_t seq;  // Sequence number
};

struct DepthUpdate {
  EventHeader header;
  Side side;
  double price;
  double size;
  uint32_t level;
  DepthOp op;
};

struct Trade {
  EventHeader header;
  double price;
  double size;
  Aggressor aggressor;
};

struct OrderEvent {
  EventHeader header;
  std::string order_id;
  OrderState state;
  double price;
  double size;
  double filled;
  std::string reason;
};

struct Bar {
  EventHeader header;
  int64_t ts_open_ns;
  int64_t ts_close_ns;
  double open;
  double high;
  double low;
  double close;
  double volume;
};

struct Heartbeat {
  EventHeader header;
};

// Variant holding any event type
using Event = std::variant<DepthUpdate, Trade, OrderEvent, Bar, Heartbeat>;

// Helper to get event type from variant
EventType get_event_type(const Event& event);

// Helper to get header from any event
const EventHeader& get_header(const Event& event);

}  // namespace nexus::eventlog

