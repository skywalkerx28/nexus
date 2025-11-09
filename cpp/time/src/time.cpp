#include "nexus/time.hpp"
#include <ctime>
#include <iomanip>
#include <sstream>

namespace nexus::time {

std::string to_iso8601(Nanoseconds ns) {
  auto seconds = ns / 1'000'000'000;
  auto nanos = ns % 1'000'000'000;
  std::time_t t = static_cast<std::time_t>(seconds);
  std::tm tm;
  gmtime_r(&t, &tm);

  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S");
  oss << '.' << std::setfill('0') << std::setw(9) << nanos << 'Z';
  return oss.str();
}

Nanoseconds from_iso8601(const std::string& iso) {
  // Simple parser for ISO 8601: YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ
  std::tm tm = {};
  std::istringstream ss(iso);
  ss >> std::get_time(&tm, "%Y-%m-%dT%H:%M:%S");
  if (ss.fail()) return 0;

  // Parse fractional seconds
  char dot;
  ss >> dot;
  if (dot != '.') return 0;

  std::string frac;
  ss >> frac;
  if (frac.empty() || frac.back() != 'Z') return 0;
  frac.pop_back();  // Remove 'Z'

  // Pad or truncate to 9 digits
  while (frac.size() < 9) frac += '0';
  if (frac.size() > 9) frac = frac.substr(0, 9);

  std::time_t t = timegm(&tm);
  Nanoseconds nanos = std::stoll(frac);
  return static_cast<Nanoseconds>(t) * 1'000'000'000 + nanos;
}

}  // namespace nexus::time

