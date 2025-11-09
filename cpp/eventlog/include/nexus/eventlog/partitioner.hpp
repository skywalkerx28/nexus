#pragma once

#include <cstdint>
#include <filesystem>
#include <string>

namespace nexus::eventlog {

/**
 * Partitioner for EventLog files.
 * Generates canonical paths and manages directory structure.
 */
class Partitioner {
 public:
  /**
   * Generate canonical path for a symbol and timestamp.
   * Format: {base_dir}/{symbol}/{YYYY}/{MM}/{DD}.parquet
   *
   * Example: data/parquet/AAPL/2025/01/09.parquet
   */
  static std::string get_path(const std::string& base_dir, const std::string& symbol,
                              int64_t ts_ns);

  /**
   * Generate path for a specific date.
   * Format: {base_dir}/{symbol}/{YYYY}/{MM}/{DD}.parquet
   */
  static std::string get_path(const std::string& base_dir, const std::string& symbol, int year,
                              int month, int day);

  /**
   * Extract symbol from a canonical path.
   * Returns empty string if path doesn't match format.
   */
  static std::string extract_symbol(const std::string& path);

  /**
   * Extract date components from a canonical path.
   * Returns {year, month, day} or {0, 0, 0} if invalid.
   */
  struct Date {
    int year;
    int month;
    int day;
  };
  static Date extract_date(const std::string& path);

  /**
   * List all Parquet files for a symbol.
   * Returns sorted list of paths.
   */
  static std::vector<std::string> list_files(const std::string& base_dir,
                                             const std::string& symbol);

  /**
   * List all symbols in the base directory.
   */
  static std::vector<std::string> list_symbols(const std::string& base_dir);

 private:
  /**
   * Convert nanoseconds since Unix epoch to {year, month, day}.
   */
  static Date timestamp_to_date(int64_t ts_ns);
};

}  // namespace nexus::eventlog

