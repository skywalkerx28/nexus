#include "nexus/eventlog/arrow_schema.hpp"

namespace nexus::eventlog {

std::shared_ptr<arrow::Schema> ArrowSchema::schema_ = nullptr;
ArrowSchema::FieldIndices ArrowSchema::indices_;

std::shared_ptr<arrow::Schema> ArrowSchema::get_schema() {
  if (schema_) {
    return schema_;
  }

  // Common fields (required)
  // Use dictionary encoding for highly repetitive string fields
  auto dict_type = arrow::dictionary(arrow::int32(), arrow::utf8());

  std::vector<std::shared_ptr<arrow::Field>> fields = {
      arrow::field("ts_event_ns", arrow::int64(), false),
      arrow::field("ts_receive_ns", arrow::int64(), false),
      arrow::field("ts_monotonic_ns", arrow::int64(), false),
      arrow::field("event_type", arrow::int8(), false),
      arrow::field("venue", dict_type, false),      // Dictionary-encoded
      arrow::field("symbol", dict_type, false),     // Dictionary-encoded
      arrow::field("source", dict_type, false),     // Dictionary-encoded
      arrow::field("seq", arrow::uint64(), false),

      // DEPTH_UPDATE fields (nullable)
      arrow::field("side", arrow::int8(), true),
      arrow::field("price", arrow::float64(), true),  // Legacy float64
      arrow::field("size", arrow::float64(), true),   // Legacy float64
      arrow::field("level", arrow::uint32(), true),
      arrow::field("op", arrow::int8(), true),

      // Decimal128 fields for exact arithmetic (nullable, dual-write for migration)
      arrow::field("price_decimal", arrow::decimal128(18, 6), true),  // scale=6 (μ precision)
      arrow::field("size_decimal", arrow::decimal128(18, 3), true),   // scale=3 (milli precision)

      // TRADE fields (nullable, reuses price/size/decimals)
      arrow::field("aggressor", arrow::int8(), true),

      // ORDER_EVENT fields (nullable, reuses price/size/decimals)
      arrow::field("order_id", arrow::utf8(), true),
      arrow::field("state", arrow::int8(), true),
      arrow::field("filled", arrow::float64(), true),
      arrow::field("filled_decimal", arrow::decimal128(18, 3), true),  // Exact filled quantity
      arrow::field("reason", arrow::utf8(), true),

      // BAR fields (nullable)
      arrow::field("ts_open_ns", arrow::int64(), true),
      arrow::field("ts_close_ns", arrow::int64(), true),
      arrow::field("open", arrow::float64(), true),
      arrow::field("high", arrow::float64(), true),
      arrow::field("low", arrow::float64(), true),
      arrow::field("close", arrow::float64(), true),
      arrow::field("open_decimal", arrow::decimal128(18, 6), true),
      arrow::field("high_decimal", arrow::decimal128(18, 6), true),
      arrow::field("low_decimal", arrow::decimal128(18, 6), true),
      arrow::field("close_decimal", arrow::decimal128(18, 6), true),
      arrow::field("volume", arrow::float64(), true),
      arrow::field("volume_decimal", arrow::decimal128(18, 3), true),
  };

  schema_ = arrow::schema(fields);
  return schema_;
}

const ArrowSchema::FieldIndices& ArrowSchema::indices() { return indices_; }

}  // namespace nexus::eventlog

