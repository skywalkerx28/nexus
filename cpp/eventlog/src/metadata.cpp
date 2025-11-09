#include "nexus/eventlog/metadata.hpp"
#include <random>
#include <sstream>
#include <iomanip>
#include <unistd.h>
#include <limits.h>

namespace nexus::eventlog {

std::map<std::string, std::string> FileMetadata::to_map() const {
  std::map<std::string, std::string> map;
  map["schema_version"] = schema_version;
  map["nexus_version"] = nexus_version;
  map["ingest_session_id"] = ingest_session_id;
  map["ingest_start_ns"] = std::to_string(ingest_start_ns);
  map["ingest_end_ns"] = std::to_string(ingest_end_ns);
  map["symbol"] = symbol;
  map["venue"] = venue;
  map["source"] = source;
  map["ingest_host"] = ingest_host;
  map["write_complete"] = write_complete ? "true" : "false";
  return map;
}

FileMetadata FileMetadata::from_map(const std::map<std::string, std::string>& map) {
  FileMetadata meta;

  auto get = [&](const std::string& key) -> std::string {
    auto it = map.find(key);
    return (it != map.end()) ? it->second : "";
  };

  meta.schema_version = get("schema_version");
  meta.nexus_version = get("nexus_version");
  meta.ingest_session_id = get("ingest_session_id");

  auto start_str = get("ingest_start_ns");
  if (!start_str.empty()) {
    meta.ingest_start_ns = std::stoll(start_str);
  }

  auto end_str = get("ingest_end_ns");
  if (!end_str.empty()) {
    meta.ingest_end_ns = std::stoll(end_str);
  }

  meta.symbol = get("symbol");
  meta.venue = get("venue");
  meta.source = get("source");
  meta.ingest_host = get("ingest_host");
  meta.write_complete = (get("write_complete") == "true");

  return meta;
}

std::string FileMetadata::generate_session_id() {
  // Generate UUID v4 (random)
  std::random_device rd;
  std::mt19937_64 gen(rd());
  std::uniform_int_distribution<uint64_t> dis;

  uint64_t a = dis(gen);
  uint64_t b = dis(gen);

  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  std::ostringstream oss;
  oss << std::hex << std::setfill('0');
  oss << std::setw(8) << (a >> 32);
  oss << '-';
  oss << std::setw(4) << ((a >> 16) & 0xFFFF);
  oss << '-';
  oss << std::setw(4) << (0x4000 | ((a >> 4) & 0x0FFF));  // Version 4
  oss << '-';
  oss << std::setw(4) << (0x8000 | ((b >> 52) & 0x3FFF));  // Variant 10
  oss << '-';
  oss << std::setw(12) << (b & 0xFFFFFFFFFFFFULL);

  return oss.str();
}

}  // namespace nexus::eventlog

