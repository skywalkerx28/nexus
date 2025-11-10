#include "nexus/eventlog/reader.hpp"
#include <iostream>
#include <filesystem>

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "Usage: " << argv[0] << " <parquet_file>\n";
    return 1;
  }

  std::string filepath = argv[1];
  
  if (!std::filesystem::exists(filepath)) {
    std::cerr << "File not found: " << filepath << "\n";
    return 1;
  }

  std::cout << "Reading: " << filepath << "\n\n";

  try {
    nexus::eventlog::Reader reader(filepath);
    
    std::cout << "Total events: " << reader.event_count() << "\n";
    std::cout << "First 10 events:\n\n";

    size_t count = 0;
    while (auto event_opt = reader.next()) {
      if (count >= 10) break;
      
      std::visit([&](auto&& e) {
        std::cout << "Event " << count << ":\n";
        std::cout << "  Symbol: " << e.header.symbol << "\n";
        std::cout << "  Venue: " << e.header.venue << "\n";
        std::cout << "  Source: " << e.header.source << "\n";
        std::cout << "  Seq: " << e.header.seq << "\n";
        std::cout << "  ts_event_ns: " << e.header.ts_event_ns << "\n";
        
        using T = std::decay_t<decltype(e)>;
        if constexpr (std::is_same_v<T, nexus::eventlog::Trade>) {
          std::cout << "  Type: TRADE\n";
          std::cout << "  Price: " << e.price << "\n";
          std::cout << "  Size: " << e.size << "\n";
        }
        std::cout << "\n";
      }, *event_opt);
      
      count++;
    }
    
    std::cout << "File is valid and readable\n";
    
  } catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }

  return 0;
}

