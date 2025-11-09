#pragma once

#include "nexus/eventlog/schema.hpp"
#include <memory>
#include <optional>
#include <string>

namespace nexus::eventlog {

/**
 * Event log reader for deterministic replay.
 * Supports sequential reading and filtering.
 */
class Reader {
 public:
  explicit Reader(const std::string& filepath);
  ~Reader();

  // Non-copyable, movable
  Reader(const Reader&) = delete;
  Reader& operator=(const Reader&) = delete;
  Reader(Reader&&) noexcept;
  Reader& operator=(Reader&&) noexcept;

  /**
   * Read next event from the log.
   * Returns nullopt if end of file or error.
   */
  std::optional<Event> next();

  /**
   * Reset reader to beginning.
   */
  void reset();

  /**
   * Get total number of events in the log.
   */
  uint64_t event_count() const;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace nexus::eventlog

