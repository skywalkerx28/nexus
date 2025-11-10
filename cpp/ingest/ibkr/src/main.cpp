#include "nexus/ingest/ibkr/feed_adapter.hpp"
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>
#include <iomanip>

// Global flag for graceful shutdown
std::atomic<bool> g_shutdown{false};

void signal_handler(int signal) {
  std::cout << "\nReceived signal " << signal << ", shutting down gracefully...\n";
  g_shutdown = true;
}

void print_stats(const nexus::ingest::ibkr::FeedStats& stats) {
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  
  std::cout << "\n=== FeedAdapter Statistics ===\n"
            << "Time: " << std::put_time(std::localtime(&time_t), "%Y-%m-%d %H:%M:%S") << "\n"
            << "Events received: " << stats.events_received << "\n"
            << "Events written: " << stats.events_written << "\n"
            << "Validation errors: " << stats.validation_errors << "\n"
            << "Connection errors: " << stats.connection_errors << "\n"
            << "Last event: " << stats.last_event_ts_ns << " ns\n"
            << "=============================\n" << std::endl;
}

int main(int argc, char** argv) {
  std::cout << "Nexus IBKR Feed Adapter\n"
            << "=======================\n\n";

  // Setup signal handlers for graceful shutdown
  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  // Configure adapter
  nexus::ingest::ibkr::IBKRConfig config;
  config.host = "127.0.0.1";
  config.port = 7497;  // Paper trading
  config.client_id = 42;
  config.parquet_dir = "./data/parquet";
  config.validate_events = true;
  config.reconnect_delay_sec = 5;
  
  // Default symbols (can be overridden via command line)
  config.symbols = {"AAPL", "MSFT", "SPY", "QQQ", "TSLA"};
  
  // Parse command line arguments
  if (argc > 1) {
    config.symbols.clear();
    for (int i = 1; i < argc; ++i) {
      config.symbols.push_back(argv[i]);
    }
  }

  std::cout << "Configuration:\n"
            << "  IBKR Gateway: " << config.host << ":" << config.port << "\n"
            << "  Symbols: ";
  for (const auto& sym : config.symbols) {
    std::cout << sym << " ";
  }
  std::cout << "\n  Output: " << config.parquet_dir << "\n\n";

  // Create and start adapter
  nexus::ingest::ibkr::FeedAdapter adapter(config);
  
  std::cout << "Starting ingestion...\n";
  adapter.start();

  // Wait for adapter to be running
  std::this_thread::sleep_for(std::chrono::seconds(1));

  if (!adapter.is_running()) {
    std::cerr << "Failed to start adapter\n";
    return 1;
  }

  std::cout << "Ingestion running. Press Ctrl+C to stop.\n";
  std::cout << "Statistics will be printed every 10 seconds.\n\n";

  // Monitor loop - print stats every 10 seconds
  auto last_stats_time = std::chrono::steady_clock::now();
  
  while (!g_shutdown.load()) {
    std::this_thread::sleep_for(std::chrono::seconds(1));
    
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_stats_time);
    
    if (elapsed.count() >= 10) {
      print_stats(adapter.get_stats());
      last_stats_time = now;
    }
    
    // Check if adapter is still running
    if (!adapter.is_running()) {
      std::cerr << "Adapter stopped unexpectedly\n";
      break;
    }
  }

  // Graceful shutdown
  std::cout << "\nStopping adapter...\n";
  adapter.stop();
  
  // Print final stats
  std::cout << "\nFinal Statistics:\n";
  print_stats(adapter.get_stats());

  std::cout << "Shutdown complete.\n";
  return 0;
}

