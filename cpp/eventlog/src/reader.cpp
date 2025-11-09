#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/arrow_schema.hpp"
#include "nexus/eventlog/metadata.hpp"
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/reader.h>
#include <iostream>
#include <stdexcept>

namespace nexus::eventlog {

// Arrow/Parquet implementation with streaming RecordBatch reader
class Reader::Impl {
 public:
  explicit Impl(const std::string& filepath)
      : filepath_(filepath),
        current_batch_idx_(0),
        current_row_in_batch_(0),
        total_rows_(0),
        batch_reader_exhausted_(false) {
    // Open Parquet file
    auto infile_result = arrow::io::ReadableFile::Open(filepath_);
    if (!infile_result.ok()) {
      throw std::runtime_error("Failed to open file: " + infile_result.status().ToString());
    }

    // Create Parquet reader
    auto reader_result =
        parquet::arrow::OpenFile(*infile_result, arrow::default_memory_pool());
    if (!reader_result.ok()) {
      throw std::runtime_error("Failed to create Parquet reader: " +
                               reader_result.status().ToString());
    }
    parquet_reader_ = std::move(*reader_result);

    // Get schema
    auto schema_status = parquet_reader_->GetSchema(&schema_);
    if (!schema_status.ok()) {
      throw std::runtime_error("Failed to get schema: " + schema_status.ToString());
    }

    // Count total rows from metadata
    auto parquet_metadata = parquet_reader_->parquet_reader()->metadata();
    total_rows_ = parquet_metadata->num_rows();

    // Check crash-safety marker (write_complete flag)
    check_write_complete(parquet_metadata);

    // Create streaming RecordBatch reader
    auto batch_reader_result = parquet_reader_->GetRecordBatchReader();
    if (!batch_reader_result.ok()) {
      throw std::runtime_error("Failed to create RecordBatch reader: " +
                               batch_reader_result.status().ToString());
    }
    batch_reader_ = std::move(*batch_reader_result);
  }

  void check_write_complete(const std::shared_ptr<parquet::FileMetaData>& parquet_metadata) {
    // Extract file metadata from Parquet key-value metadata
    auto kv_metadata = parquet_metadata->key_value_metadata();
    if (!kv_metadata) {
      std::cerr << "WARNING: File " << filepath_ << " has no metadata (old format?)" << std::endl;
      return;
    }

    // Build map from key-value pairs
    std::map<std::string, std::string> metadata_map;
    for (int64_t i = 0; i < kv_metadata->size(); ++i) {
      metadata_map[kv_metadata->key(i)] = kv_metadata->value(i);
    }

    // Parse FileMetadata
    auto file_metadata = FileMetadata::from_map(metadata_map);

    // Check write_complete flag
    if (!file_metadata.write_complete) {
      std::cerr << "WARNING: File " << filepath_ 
                << " may be incomplete (write_complete=false). "
                << "Writer may have crashed before closing properly." << std::endl;
    }
  }

  std::optional<Event> read() {
    // Load next batch if needed
    if (!current_batch_ || current_row_in_batch_ >= current_batch_->num_rows()) {
      if (!load_next_batch()) {
        return std::nullopt;
      }
    }

    // Read event from current batch
    auto event = read_event_at(current_row_in_batch_);
    current_row_in_batch_++;
    return event;
  }

  void reset() {
    // Re-create the batch reader to start from beginning
    auto batch_reader_result = parquet_reader_->GetRecordBatchReader();
    if (!batch_reader_result.ok()) {
      throw std::runtime_error("Failed to reset RecordBatch reader: " +
                               batch_reader_result.status().ToString());
    }
    batch_reader_ = std::move(*batch_reader_result);
    current_batch_.reset();
    current_batch_idx_ = 0;
    current_row_in_batch_ = 0;
    batch_reader_exhausted_ = false;
  }

  uint64_t count() const { return total_rows_; }

 private:
  bool load_next_batch() {
    if (batch_reader_exhausted_) {
      return false;
    }

    auto status = batch_reader_->ReadNext(&current_batch_);
    if (!status.ok()) {
      throw std::runtime_error("Failed to read next batch: " + status.ToString());
    }

    if (!current_batch_) {
      batch_reader_exhausted_ = true;
      return false;
    }

    current_row_in_batch_ = 0;
    current_batch_idx_++;
    return true;
  }

  Event read_event_at(int64_t row) {
    const auto& idx = ArrowSchema::indices();

    // Read common fields
    EventHeader header;
    header.ts_event_ns = get_value<arrow::Int64Array, int64_t>(idx.ts_event_ns, row);
    header.ts_receive_ns = get_value<arrow::Int64Array, int64_t>(idx.ts_receive_ns, row);
    header.ts_monotonic_ns = get_value<arrow::Int64Array, int64_t>(idx.ts_monotonic_ns, row);
    header.venue = get_value<arrow::StringArray, std::string>(idx.venue, row);
    header.symbol = get_value<arrow::StringArray, std::string>(idx.symbol, row);
    header.source = get_value<arrow::StringArray, std::string>(idx.source, row);
    header.seq = get_value<arrow::UInt64Array, uint64_t>(idx.seq, row);

    auto event_type =
        static_cast<EventType>(get_value<arrow::Int8Array, int8_t>(idx.event_type, row));

    // Read event-specific fields based on type
    switch (event_type) {
      case EventType::DEPTH_UPDATE: {
        DepthUpdate event;
        event.header = header;
        event.side = static_cast<Side>(get_value<arrow::Int8Array, int8_t>(idx.side, row));
        event.price = get_value<arrow::DoubleArray, double>(idx.price, row);
        event.size = get_value<arrow::DoubleArray, double>(idx.size, row);
        event.level = get_value<arrow::UInt32Array, uint32_t>(idx.level, row);
        event.op = static_cast<DepthOp>(get_value<arrow::Int8Array, int8_t>(idx.op, row));
        return event;
      }
      case EventType::TRADE: {
        Trade event;
        event.header = header;
        event.price = get_value<arrow::DoubleArray, double>(idx.price, row);
        event.size = get_value<arrow::DoubleArray, double>(idx.size, row);
        event.aggressor =
            static_cast<Aggressor>(get_value<arrow::Int8Array, int8_t>(idx.aggressor, row));
        return event;
      }
      case EventType::ORDER_EVENT: {
        OrderEvent event;
        event.header = header;
        event.order_id = get_value<arrow::StringArray, std::string>(idx.order_id, row);
        event.state =
            static_cast<OrderState>(get_value<arrow::Int8Array, int8_t>(idx.state, row));
        event.price = get_value<arrow::DoubleArray, double>(idx.price, row);
        event.size = get_value<arrow::DoubleArray, double>(idx.size, row);
        event.filled = get_value<arrow::DoubleArray, double>(idx.filled, row);
        event.reason = get_value<arrow::StringArray, std::string>(idx.reason, row);
        return event;
      }
      case EventType::BAR: {
        Bar event;
        event.header = header;
        event.ts_open_ns = get_value<arrow::Int64Array, int64_t>(idx.ts_open_ns, row);
        event.ts_close_ns = get_value<arrow::Int64Array, int64_t>(idx.ts_close_ns, row);
        event.open = get_value<arrow::DoubleArray, double>(idx.open, row);
        event.high = get_value<arrow::DoubleArray, double>(idx.high, row);
        event.low = get_value<arrow::DoubleArray, double>(idx.low, row);
        event.close = get_value<arrow::DoubleArray, double>(idx.close, row);
        event.volume = get_value<arrow::DoubleArray, double>(idx.volume, row);
        return event;
      }
      case EventType::HEARTBEAT:
      default: {
        Heartbeat event;
        event.header = header;
        return event;
      }
    }
  }

  template <typename ArrayType, typename ValueType>
  ValueType get_value(int col_idx, int64_t row) {
    // Get column from current RecordBatch (not Table)
    auto column = current_batch_->column(col_idx);

    // Handle dictionary-encoded strings
    if constexpr (std::is_same_v<ValueType, std::string>) {
      if (column->type()->id() == arrow::Type::DICTIONARY) {
        auto dict_array = std::static_pointer_cast<arrow::DictionaryArray>(column);
        auto indices = std::static_pointer_cast<arrow::Int32Array>(dict_array->indices());
        auto dictionary = std::static_pointer_cast<arrow::StringArray>(dict_array->dictionary());
        int32_t index = indices->Value(row);
        return dictionary->GetString(index);
      } else {
        auto array = std::static_pointer_cast<ArrayType>(column);
        return array->GetString(row);
      }
    } else {
      auto array = std::static_pointer_cast<ArrayType>(column);
      return array->Value(row);
    }
  }

  std::string filepath_;
  std::shared_ptr<arrow::Schema> schema_;
  std::unique_ptr<parquet::arrow::FileReader> parquet_reader_;
  std::shared_ptr<arrow::RecordBatchReader> batch_reader_;
  std::shared_ptr<arrow::RecordBatch> current_batch_;
  int current_batch_idx_;
  int64_t current_row_in_batch_;
  int64_t total_rows_;
  bool batch_reader_exhausted_;
};

Reader::Reader(const std::string& filepath) : impl_(std::make_unique<Impl>(filepath)) {}

Reader::~Reader() = default;

Reader::Reader(Reader&&) noexcept = default;
Reader& Reader::operator=(Reader&&) noexcept = default;

std::optional<Event> Reader::next() { return impl_->read(); }

void Reader::reset() { impl_->reset(); }

uint64_t Reader::event_count() const { return impl_->count(); }

}  // namespace nexus::eventlog

