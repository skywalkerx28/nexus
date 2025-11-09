#include "nexus/eventlog/partitioner.hpp"
#include <algorithm>
#include <ctime>
#include <iomanip>
#include <regex>
#include <sstream>

namespace nexus::eventlog {

Partitioner::Date Partitioner::timestamp_to_date(int64_t ts_ns) {
  // Convert ns to seconds
  std::time_t t = static_cast<std::time_t>(ts_ns / 1'000'000'000);

  // Convert to UTC date
  std::tm tm;
  gmtime_r(&t, &tm);

  return {tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday};
}

std::string Partitioner::get_path(const std::string& base_dir, const std::string& symbol,
                                  int64_t ts_ns) {
  auto date = timestamp_to_date(ts_ns);
  return get_path(base_dir, symbol, date.year, date.month, date.day);
}

std::string Partitioner::get_path(const std::string& base_dir, const std::string& symbol,
                                  int year, int month, int day) {
  std::filesystem::path path(base_dir);
  path /= symbol;
  
  // Zero-pad YYYY/MM/DD for lexicographic ordering
  std::ostringstream year_dir, month_dir, filename;
  year_dir << std::setfill('0') << std::setw(4) << year;
  month_dir << std::setfill('0') << std::setw(2) << month;
  filename << std::setfill('0') << std::setw(2) << day << ".parquet";
  
  path /= year_dir.str();
  path /= month_dir.str();
  path /= filename.str();
  
  return path.string();
}

std::string Partitioner::extract_symbol(const std::string& path) {
  // Match pattern: .../SYMBOL/YYYY/MM/DD.parquet (zero-padded)
  std::regex pattern(R"(/([A-Z0-9]+)/\d{4}/\d{2}/\d{2}\.parquet$)");
  std::smatch match;

  if (std::regex_search(path, match, pattern)) {
    return match[1].str();
  }

  return "";
}

Partitioner::Date Partitioner::extract_date(const std::string& path) {
  // Match pattern: .../YYYY/MM/DD.parquet (zero-padded)
  std::regex pattern(R"(/(\d{4})/(\d{2})/(\d{2})\.parquet$)");
  std::smatch match;

  if (std::regex_search(path, match, pattern)) {
    return {std::stoi(match[1].str()), std::stoi(match[2].str()), std::stoi(match[3].str())};
  }

  return {0, 0, 0};
}

std::vector<std::string> Partitioner::list_files(const std::string& base_dir,
                                                 const std::string& symbol) {
  std::vector<std::string> files;
  std::filesystem::path symbol_dir = std::filesystem::path(base_dir) / symbol;

  if (!std::filesystem::exists(symbol_dir)) {
    return files;
  }

  // Recursively find all .parquet files
  for (const auto& entry : std::filesystem::recursive_directory_iterator(symbol_dir)) {
    if (entry.is_regular_file() && entry.path().extension() == ".parquet") {
      files.push_back(entry.path().string());
    }
  }

  // Sort by path (which sorts by date due to YYYY/MM/DD structure)
  std::sort(files.begin(), files.end());

  return files;
}

std::vector<std::string> Partitioner::list_symbols(const std::string& base_dir) {
  std::vector<std::string> symbols;
  std::filesystem::path base(base_dir);

  if (!std::filesystem::exists(base)) {
    return symbols;
  }

  // List immediate subdirectories (symbols)
  for (const auto& entry : std::filesystem::directory_iterator(base)) {
    if (entry.is_directory()) {
      symbols.push_back(entry.path().filename().string());
    }
  }

  // Sort alphabetically
  std::sort(symbols.begin(), symbols.end());

  return symbols;
}

}  // namespace nexus::eventlog

