#pragma once

#include <cstdint>
#include <map>
#include <string>

namespace nexus::eventlog {

/**
 * Metadata for Parquet files.
 * Written as key-value pairs in Parquet file metadata.
 */
struct FileMetadata {
  std::string schema_version = "1.0";
  std::string nexus_version = "0.2.0";
  std::string ingest_session_id;  // UUID for deduplication
  std::string feed_mode;          // "live" or "delayed"
  int64_t ingest_start_ns = 0;    // First event timestamp
  int64_t ingest_end_ns = 0;      // Last event timestamp
  std::string symbol;             // Primary symbol
  std::string venue;              // Primary venue
  std::string source;             // Data source
  std::string ingest_host;        // Hostname of ingestion machine
  bool write_complete = false;    // Crash-safety: true if writer closed successfully

  /**
   * Convert to key-value map for Parquet metadata.
   */
  std::map<std::string, std::string> to_map() const;

  /**
   * Parse from key-value map.
   */
  static FileMetadata from_map(const std::map<std::string, std::string>& map);

  /**
   * Generate a new session ID (UUID v4).
   */
  static std::string generate_session_id();
};

}  // namespace nexus::eventlog

