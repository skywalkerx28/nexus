#pragma once

#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/writer.h>
#include <memory>

namespace nexus::eventlog {

/**
 * Arrow schema factory for EventLog.
 * Defines the canonical schema for all event types.
 */
class ArrowSchema {
 public:
  /**
   * Get the complete Arrow schema for EventLog.
   * Includes common fields + event-specific fields (nullable).
   */
  static std::shared_ptr<arrow::Schema> get_schema();

  /**
   * Get field indices for fast column access.
   */
  struct FieldIndices {
    // Common fields
    int ts_event_ns = 0;
    int ts_receive_ns = 1;
    int ts_monotonic_ns = 2;
    int event_type = 3;
    int venue = 4;
    int symbol = 5;
    int source = 6;
    int seq = 7;

    // DEPTH_UPDATE fields
    int side = 8;
    int price = 9;         // Legacy float64
    int size = 10;          // Legacy float64
    int level = 11;
    int op = 12;

    // Decimal128 fields (exact arithmetic)
    int price_decimal = 13;
    int size_decimal = 14;

    // TRADE fields (reuses price, size, decimals)
    int aggressor = 15;

    // ORDER_EVENT fields (reuses price, size, decimals)
    int order_id = 16;
    int state = 17;
    int filled = 18;
    int filled_decimal = 19;
    int reason = 20;

    // BAR fields
    int ts_open_ns = 21;
    int ts_close_ns = 22;
    int open = 23;
    int high = 24;
    int low = 25;
    int close = 26;
    int open_decimal = 27;
    int high_decimal = 28;
    int low_decimal = 29;
    int close_decimal = 30;
    int volume = 31;
    int volume_decimal = 32;
  };

  static const FieldIndices& indices();

 private:
  static std::shared_ptr<arrow::Schema> schema_;
  static FieldIndices indices_;
};

}  // namespace nexus::eventlog

