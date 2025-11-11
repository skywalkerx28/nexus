#pragma once

#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/metadata.hpp"
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

  /**
   * Set time range filter (inclusive).
   * Only events with ts_event_ns in [start_ns, end_ns] will be returned.
   * Use 0 for start_ns or INT64_MAX for end_ns to leave unbounded.
   */
  void set_time_range(int64_t start_ns, int64_t end_ns);

  /**
   * Set sequence range filter (inclusive).
   * Only events with seq in [min_seq, max_seq] will be returned.
   * Use 0 for min_seq or UINT64_MAX for max_seq to leave unbounded.
   */
  void set_seq_range(uint64_t min_seq, uint64_t max_seq);

  /**
   * Clear all filters.
   */
  void clear_filters();

  /**
   * Get number of row groups in the file.
   * Useful for verifying pruning effectiveness.
   */
  int row_group_count() const;

  /**
   * Get number of row groups actually read (touched).
   * Use after reading with filters to verify IO-level pruning effectiveness.
   * Returns 0 before first read, accumulates across reads until reset().
   */
  int row_groups_touched() const;

  /**
   * Get file metadata (provenance, feed_mode, write_complete, etc.).
   * Useful for de-duplication, audit, and quality checks.
   * Returns empty metadata if file has no custom metadata.
   */
  FileMetadata get_metadata() const;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace nexus::eventlog

