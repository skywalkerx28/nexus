#include "nexus/ingest/ibkr/feed_adapter.hpp"
#include <iostream>
#include <random>
#include <iomanip>

namespace nexus::ingest::ibkr {

FeedAdapter::FeedAdapter(const IBKRConfig& config) : config_(config) {
  std::cout << "FeedAdapter initialized:\n"
            << "  Host: " << config_.host << ":" << config_.port << "\n"
            << "  Client ID: " << config_.client_id << "\n"
            << "  Symbols: ";
  for (const auto& sym : config_.symbols) {
    std::cout << sym << " ";
  }
  std::cout << "\n  Parquet dir: " << config_.parquet_dir << "\n";
}

FeedAdapter::~FeedAdapter() {
  stop();
}

void FeedAdapter::start() {
  if (running_.load()) {
    std::cerr << "FeedAdapter already running\n";
    return;
  }

  std::cout << "Starting FeedAdapter...\n";
  running_ = true;
  should_stop_ = false;
  
  // Start ingestion thread
  ingestion_thread_ = std::make_unique<std::thread>(&FeedAdapter::ingestion_loop, this);
  
  std::cout << "FeedAdapter started\n";
}

void FeedAdapter::stop() {
  if (!running_.load()) {
    return;
  }

  std::cout << "Stopping FeedAdapter...\n";
  should_stop_ = true;
  
  if (ingestion_thread_ && ingestion_thread_->joinable()) {
    ingestion_thread_->join();
  }
  
  // Close all writers
  {
    std::lock_guard<std::mutex> lock(writers_mutex_);
    for (auto& [symbol, writer] : writers_) {
      std::cout << "Closing writer for " << symbol << "\n";
      writer->close();
    }
    writers_.clear();
  }
  
  running_ = false;
  connected_ = false;
  
  std::cout << "FeedAdapter stopped\n";
  std::cout << "Final stats:\n"
            << "  Events received: " << stats_.events_received << "\n"
            << "  Events written: " << stats_.events_written << "\n"
            << "  Validation errors: " << stats_.validation_errors << "\n"
            << "  Connection errors: " << stats_.connection_errors << "\n";
}

void FeedAdapter::ingestion_loop() {
  while (!should_stop_.load()) {
    // Try to connect if not connected
    if (!connected_.load()) {
      if (connect()) {
        if (subscribe_market_data()) {
          std::cout << "Successfully subscribed to market data\n";
        } else {
          std::cerr << "Failed to subscribe to market data\n";
          stats_.connection_errors++;
          std::this_thread::sleep_for(std::chrono::seconds(config_.reconnect_delay_sec));
          continue;
        }
      } else {
        std::cerr << "Failed to connect, retrying in " << config_.reconnect_delay_sec << "s...\n";
        stats_.connection_errors++;
        std::this_thread::sleep_for(std::chrono::seconds(config_.reconnect_delay_sec));
        continue;
      }
    }

    // Process market data
    try {
      process_market_data();
    } catch (const std::exception& e) {
      std::cerr << "Error processing market data: " << e.what() << "\n";
      connected_ = false;
      stats_.connection_errors++;
    }
    
    // Small sleep to avoid spinning (real IBKR API would block on callbacks)
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
}

bool FeedAdapter::connect() {
  std::cout << "Connecting to IBKR Gateway at " << config_.host << ":" << config_.port << "...\n";
  
  // TODO: Real IBKR API connection
  // For now, simulate successful connection
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  
  connected_ = true;
  std::cout << "Connected to IBKR Gateway\n";
  return true;
}

bool FeedAdapter::subscribe_market_data() {
  std::cout << "Subscribing to market data for " << config_.symbols.size() << " symbols...\n";
  
  // TODO: Real IBKR API subscription
  // For now, simulate successful subscription
  for (const auto& symbol : config_.symbols) {
    std::cout << "  Subscribed to " << symbol << "\n";
  }
  
  return true;
}

void FeedAdapter::process_market_data() {
  // TODO: Real IBKR API callbacks
  // For now, generate mock market data for testing
  
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_real_distribution<> price_dist(100.0, 200.0);
  static std::uniform_real_distribution<> size_dist(1.0, 1000.0);
  static std::uniform_int_distribution<> symbol_dist(0, config_.symbols.size() - 1);
  
  // Generate a random trade event
  const std::string& symbol = config_.symbols[symbol_dist(gen)];
  double price = price_dist(gen);
  double size = size_dist(gen);
  
  stats_.events_received++;
  
  // Convert to EventLog event
  auto event = convert_tick_to_event(symbol, price, size);
  
  // Get or create writer for this symbol
  std::unique_ptr<eventlog::Writer>* writer_ptr = nullptr;
  {
    std::lock_guard<std::mutex> lock(writers_mutex_);
    auto it = writers_.find(symbol);
    if (it == writers_.end()) {
      // Create new writer for this symbol
      auto writer = create_writer(symbol);
      writer_ptr = &(writers_[symbol] = std::move(writer));
    } else {
      writer_ptr = &it->second;
    }
  }
  
  // Write event
  if ((*writer_ptr)->append(event)) {
    stats_.events_written++;
    stats_.last_event_ts_ns = time::wall_ns();
  } else {
    stats_.validation_errors++;
  }
  
  // Flush every 1000 events
  if (stats_.events_written % 1000 == 0) {
    (*writer_ptr)->flush();
  }
}

std::unique_ptr<eventlog::Writer> FeedAdapter::create_writer(const std::string& symbol) {
  // Use Partitioner to get canonical path
  auto path = eventlog::Partitioner::get_path(config_.parquet_dir, symbol, time::wall_ns());
  
  std::cout << "Creating writer for " << symbol << " at " << path << "\n";
  
  return std::make_unique<eventlog::Writer>(path);
}

eventlog::Event FeedAdapter::convert_tick_to_event(
    const std::string& symbol, double price, double size) {
  
  // Create a Trade event (most common)
  eventlog::Trade trade;
  
  // Fill header
  trade.header.ts_event_ns = time::wall_ns();
  trade.header.ts_receive_ns = time::wall_ns();
  trade.header.ts_monotonic_ns = time::monotonic_ns();
  trade.header.venue = "NASDAQ";  // TODO: Get from IBKR
  trade.header.symbol = symbol;
  trade.header.source = "IBKR";
  trade.header.seq = stats_.events_received.load();
  
  // Fill trade data
  trade.price = price;
  trade.size = size;
  trade.aggressor = eventlog::Aggressor::UNKNOWN;  // TODO: Get from IBKR
  
  return trade;
}

}  // namespace nexus::ingest::ibkr

