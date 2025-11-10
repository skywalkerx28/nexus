#pragma once

#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/eventlog/partitioner.hpp"
#include "nexus/time.hpp"
#include <memory>
#include <string>
#include <vector>
#include <atomic>
#include <thread>
#include <chrono>

namespace nexus::ingest::ibkr {

// Configuration for IBKR connection
struct IBKRConfig {
  std::string host = "127.0.0.1";
  int port = 7497;  // Paper trading (7496 for live)
  int client_id = 42;
  std::vector<std::string> symbols;
  std::string parquet_dir = "./data/parquet";
  bool validate_events = true;
  int reconnect_delay_sec = 5;
};

// Statistics for monitoring (plain types for copyability)
struct FeedStats {
  uint64_t events_received{0};
  uint64_t events_written{0};
  uint64_t validation_errors{0};
  uint64_t connection_errors{0};
  uint64_t last_event_ts_ns{0};
  
  void reset() {
    events_received = 0;
    events_written = 0;
    validation_errors = 0;
    connection_errors = 0;
    last_event_ts_ns = 0;
  }
};

// Internal stats with atomics (not exposed)
struct AtomicStats {
  std::atomic<uint64_t> events_received{0};
  std::atomic<uint64_t> events_written{0};
  std::atomic<uint64_t> validation_errors{0};
  std::atomic<uint64_t> connection_errors{0};
  std::atomic<uint64_t> last_event_ts_ns{0};
};

// IBKR Feed Adapter - connects to IB Gateway and writes to EventLog
class FeedAdapter {
 public:
  explicit FeedAdapter(const IBKRConfig& config);
  ~FeedAdapter();

  // Start ingestion (non-blocking, runs in background thread)
  void start();

  // Stop ingestion gracefully
  void stop();

  // Get current statistics (atomics can't be copied, so load each field)
  FeedStats get_stats() const {
    FeedStats stats;
    stats.events_received = stats_.events_received.load();
    stats.events_written = stats_.events_written.load();
    stats.validation_errors = stats_.validation_errors.load();
    stats.connection_errors = stats_.connection_errors.load();
    stats.last_event_ts_ns = stats_.last_event_ts_ns.load();
    return stats;
  }

  // Check if adapter is running
  bool is_running() const { return running_.load(); }

  // Check if connected to IBKR
  bool is_connected() const { return connected_.load(); }

 private:
  // Main ingestion loop (runs in background thread)
  void ingestion_loop();

  // Connect to IBKR Gateway
  bool connect();

  // Subscribe to market data for configured symbols
  bool subscribe_market_data();

  // Process incoming market data (mock for now, real IBKR API later)
  void process_market_data();

  // Create EventLog writer for a symbol
  std::unique_ptr<eventlog::Writer> create_writer(const std::string& symbol);

  // Convert IBKR tick to EventLog event
  eventlog::Event convert_tick_to_event(const std::string& symbol, double price, double size);

  IBKRConfig config_;
  AtomicStats stats_;  // Internal atomic stats
  std::atomic<bool> running_{false};
  std::atomic<bool> connected_{false};
  std::atomic<bool> should_stop_{false};
  std::unique_ptr<std::thread> ingestion_thread_;
  
  // Per-symbol writers (one file per symbol per day)
  std::unordered_map<std::string, std::unique_ptr<eventlog::Writer>> writers_;
  std::mutex writers_mutex_;
};

}  // namespace nexus::ingest::ibkr

