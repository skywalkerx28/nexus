#pragma once

#include "nexus/eventlog/schema.hpp"
#include <memory>
#include <string>

namespace nexus::eventlog {

/**
 * Append-only event log writer using Parquet format.
 * Thread-safe for single writer.
 */
class Writer {
 public:
  explicit Writer(const std::string& filepath);
  ~Writer();

  // Non-copyable, movable
  Writer(const Writer&) = delete;
  Writer& operator=(const Writer&) = delete;
  Writer(Writer&&) noexcept;
  Writer& operator=(Writer&&) noexcept;

  /**
   * Append an event to the log.
   * Returns true on success, false on error.
   */
  bool append(const Event& event);

  /**
   * Flush buffered events to disk.
   */
  void flush();

  /**
   * Close the writer (automatically called by destructor).
   */
  void close();

  /**
   * Get number of events written.
   */
  uint64_t event_count() const { return event_count_; }

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
  uint64_t event_count_ = 0;
};

}  // namespace nexus::eventlog

