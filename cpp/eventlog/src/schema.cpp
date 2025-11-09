#include "nexus/eventlog/schema.hpp"

namespace nexus::eventlog {

EventType get_event_type(const Event& event) {
  return std::visit(
      [](auto&& arg) -> EventType {
        using T = std::decay_t<decltype(arg)>;
        if constexpr (std::is_same_v<T, DepthUpdate>) {
          return EventType::DEPTH_UPDATE;
        } else if constexpr (std::is_same_v<T, Trade>) {
          return EventType::TRADE;
        } else if constexpr (std::is_same_v<T, OrderEvent>) {
          return EventType::ORDER_EVENT;
        } else if constexpr (std::is_same_v<T, Bar>) {
          return EventType::BAR;
        } else if constexpr (std::is_same_v<T, Heartbeat>) {
          return EventType::HEARTBEAT;
        }
      },
      event);
}

const EventHeader& get_header(const Event& event) {
  return std::visit([](auto&& arg) -> const EventHeader& { return arg.header; }, event);
}

}  // namespace nexus::eventlog

