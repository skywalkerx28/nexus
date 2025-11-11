#include "nexus/eventlog/writer.hpp"
#include "nexus/eventlog/arrow_schema.hpp"
#include "nexus/eventlog/metadata.hpp"
#include "nexus/eventlog/validator.hpp"
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/writer.h>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <unistd.h>
#include <fcntl.h>
#include <limits.h>

namespace nexus::eventlog {

// Arrow/Parquet implementation
class Writer::Impl {
 public:
  explicit Impl(const std::string& filepath)
      : final_filepath_(filepath),
        batch_size_(10000),
        current_batch_(0),
        closed_(false),
        total_rows_written_(0),
        validation_errors_(0) {
    // Use atomic write: write to temp file, then rename on successful close
    temp_filepath_ = final_filepath_ + ".partial";
    filepath_ = temp_filepath_;  // Write to temp path
    
    schema_ = ArrowSchema::get_schema();
    builders_.reserve(schema_->num_fields());

    // Initialize metadata
    metadata_.ingest_session_id = FileMetadata::generate_session_id();

    // Get hostname
    char hostname[256];  // Standard buffer size for hostname
    if (gethostname(hostname, sizeof(hostname)) == 0) {
      metadata_.ingest_host = hostname;
    } else {
      metadata_.ingest_host = "unknown";
    }

    // Ensure parent directory exists
    std::filesystem::path path(final_filepath_);
    auto parent = path.parent_path();
    if (!parent.empty() && !std::filesystem::exists(parent)) {
      std::filesystem::create_directories(parent);
    }
    
    // Remove any existing partial file
    std::filesystem::remove(temp_filepath_);

    // Create builders for each field
    for (int i = 0; i < schema_->num_fields(); ++i) {
      auto field = schema_->field(i);
      std::unique_ptr<arrow::ArrayBuilder> builder;

      // Use DictionaryBuilder for dictionary-encoded fields
      if (field->type()->id() == arrow::Type::DICTIONARY) {
        auto dict_type = std::static_pointer_cast<arrow::DictionaryType>(field->type());
        builder = std::make_unique<arrow::StringDictionaryBuilder>(arrow::default_memory_pool());
      } else {
        auto status = arrow::MakeBuilder(arrow::default_memory_pool(), field->type(), &builder);
        if (!status.ok()) {
          throw std::runtime_error("Failed to create Arrow builder: " + status.ToString());
        }
      }
      
      // Reserve capacity to avoid reallocs during append (performance optimization)
      auto reserve_status = builder->Reserve(batch_size_);
      if (!reserve_status.ok()) {
        // Non-fatal: continue without reservation
        std::cerr << "Warning: Failed to reserve builder capacity: " 
                  << reserve_status.ToString() << std::endl;
      }
      
      builders_.push_back(std::move(builder));
    }

    // Open Parquet writer immediately
    open_writer();
  }

  bool write(const Event& event) {
    if (closed_) {
      throw std::runtime_error("Cannot append to closed writer");
    }

    // Validate event
    auto validation = Validator::validate(event);
    if (!validation.valid) {
      std::cerr << "EventLog validation error: " << validation.error_message << std::endl;
      validation_errors_++;
      return false;  // Reject invalid event
    }

    // Check ordering if we have a previous event
    if (last_header_.has_value()) {
      auto ordering = Validator::validate_ordering(get_header(event), *last_header_);
      if (!ordering.valid) {
        std::cerr << "EventLog ordering error: " << ordering.error_message << std::endl;
        validation_errors_++;
        return false;
      }
    }

    try {
      append_event(event);
      current_batch_++;
      total_rows_written_++;

      // Update last header for ordering checks
      const auto& header = get_header(event);
      last_header_ = header;

      // Update metadata
      if (total_rows_written_ == 1) {
        metadata_.ingest_start_ns = header.ts_event_ns;
        metadata_.symbol = header.symbol;
        metadata_.venue = header.venue;
        metadata_.source = header.source;
      }
      metadata_.ingest_end_ns = header.ts_event_ns;

      // Flush when batch is full
      if (current_batch_ >= batch_size_) {
        flush_batch();
      }
      return true;
    } catch (const std::exception& e) {
      std::cerr << "EventLog write error: " << e.what() << std::endl;
      return false;
    }
  }

  void flush() {
    if (closed_) {
      return;  // Already closed
    }

    if (current_batch_ > 0) {
      flush_batch();
    }
    // Keep writer open for more writes
  }

  void close() {
    if (closed_) {
      return;
    }

    // Flush any remaining batch
    if (current_batch_ > 0) {
      flush_batch();
    }

    // Mark write as complete (crash-safety marker)
    metadata_.write_complete = true;

    // Close Parquet writer (metadata is written here)
    if (writer_) {
      auto status = writer_->Close();
      if (!status.ok()) {
        throw std::runtime_error("Failed to close Parquet writer: " + status.ToString());
      }
      writer_.reset();
    }

    // Atomic rename: move temp file to final location
    // This ensures incomplete files are never visible at the final path
    std::error_code ec;
    std::filesystem::rename(temp_filepath_, final_filepath_, ec);
    if (ec) {
      throw std::runtime_error("Failed to atomically rename file: " + ec.message());
    }

    // Durability guarantee: fsync parent directory to persist rename metadata
    // Without this, rename may be lost on power failure before kernel flush
    // Note: macOS requires F_FULLFSYNC instead of fsync for directories
    try {
      std::filesystem::path final_path(final_filepath_);
      auto parent_dir = final_path.parent_path();
      
      // Open parent directory for fsync
      int dir_fd = ::open(parent_dir.c_str(), O_RDONLY);
      if (dir_fd >= 0) {
#ifdef __APPLE__
        // macOS: use F_FULLFSYNC (fsync on dir returns EINVAL)
        if (::fcntl(dir_fd, F_FULLFSYNC) != 0 && errno != ENOTSUP) {
          // ENOTSUP is acceptable (some filesystems don't support it)
          std::cerr << "Warning: F_FULLFSYNC(parent_dir) failed: " << std::strerror(errno) << std::endl;
        }
#else
        // Linux/other: standard fsync
        if (::fsync(dir_fd) != 0) {
          std::cerr << "Warning: fsync(parent_dir) failed: " << std::strerror(errno) << std::endl;
        }
#endif
        ::close(dir_fd);
      }
      // Non-fatal if fsync fails (better than nothing)
    } catch (...) {
      // Ignore fsync errors (already renamed, this is durability insurance)
    }

    closed_ = true;
  }

  uint64_t rows_written() const { return total_rows_written_; }

  uint64_t validation_errors() const { return validation_errors_; }
  
  void set_ingest_session_id(const std::string& session_id) {
    if (total_rows_written_ > 0) {
      std::cerr << "Warning: set_ingest_session_id called after writes; "
                << "metadata may be incomplete" << std::endl;
    }
    metadata_.ingest_session_id = session_id;
  }
  
  void set_feed_mode(const std::string& feed_mode) {
    if (total_rows_written_ > 0) {
      std::cerr << "Warning: set_feed_mode called after writes; "
                << "metadata may be incomplete" << std::endl;
    }
    metadata_.feed_mode = feed_mode;
  }

 private:
  // Helper: convert float64 to decimal128 (scale=6 for price, scale=3 for size)
  // Pre-computed scale multipliers for fast conversion
  static constexpr std::array<double, 10> SCALE_MULTIPLIERS = {
    1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0,
    1000000.0, 10000000.0, 100000000.0, 1000000000.0
  };

  arrow::Decimal128 to_decimal128(double value, int scale) noexcept {
    // Fast path: check for non-finite values
    if (!std::isfinite(value)) [[unlikely]] {
      return arrow::Decimal128(0);
    }
    
    // Use pre-computed multiplier (no pow call!)
    const double multiplier = SCALE_MULTIPLIERS[scale];
    const int64_t scaled = static_cast<int64_t>(std::round(value * multiplier));
    return arrow::Decimal128(scaled);
  }

  void append_event(const Event& event) {
    const auto& idx = ArrowSchema::indices();
    const auto& header = get_header(event);
    auto type = get_event_type(event);

    // Common fields
    append_value<arrow::Int64Builder>(idx.ts_event_ns, header.ts_event_ns);
    append_value<arrow::Int64Builder>(idx.ts_receive_ns, header.ts_receive_ns);
    append_value<arrow::Int64Builder>(idx.ts_monotonic_ns, header.ts_monotonic_ns);
    append_value<arrow::Int8Builder>(idx.event_type, static_cast<int8_t>(type));
    append_value<arrow::StringBuilder>(idx.venue, header.venue);
    append_value<arrow::StringBuilder>(idx.symbol, header.symbol);
    append_value<arrow::StringBuilder>(idx.source, header.source);
    append_value<arrow::UInt64Builder>(idx.seq, header.seq);

    // Event-specific fields (append nulls for unused fields)
    std::visit(
        [this, &idx](auto&& arg) {
          using T = std::decay_t<decltype(arg)>;
          if constexpr (std::is_same_v<T, DepthUpdate>) {
            append_value<arrow::Int8Builder>(idx.side, static_cast<int8_t>(arg.side));
            append_value<arrow::DoubleBuilder>(idx.price, arg.price);  // Legacy
            append_value<arrow::DoubleBuilder>(idx.size, arg.size);    // Legacy
            append_value<arrow::UInt32Builder>(idx.level, arg.level);
            append_value<arrow::Int8Builder>(idx.op, static_cast<int8_t>(arg.op));
            // Dual-write decimal128
            append_decimal(idx.price_decimal, arg.price, 6);
            append_decimal(idx.size_decimal, arg.size, 3);
            append_null(idx.aggressor);
            append_null(idx.order_id);
            append_null(idx.state);
            append_null(idx.filled);
            append_null(idx.filled_decimal);
            append_null(idx.reason);
            append_null(idx.ts_open_ns);
            append_null(idx.ts_close_ns);
            append_null(idx.open);
            append_null(idx.high);
            append_null(idx.low);
            append_null(idx.close);
            append_null(idx.open_decimal);
            append_null(idx.high_decimal);
            append_null(idx.low_decimal);
            append_null(idx.close_decimal);
            append_null(idx.volume);
            append_null(idx.volume_decimal);
          } else if constexpr (std::is_same_v<T, Trade>) {
            append_null(idx.side);
            append_value<arrow::DoubleBuilder>(idx.price, arg.price);  // Legacy
            append_value<arrow::DoubleBuilder>(idx.size, arg.size);    // Legacy
            append_null(idx.level);
            append_null(idx.op);
            // Dual-write decimal128
            append_decimal(idx.price_decimal, arg.price, 6);
            append_decimal(idx.size_decimal, arg.size, 3);
            append_value<arrow::Int8Builder>(idx.aggressor, static_cast<int8_t>(arg.aggressor));
            append_null(idx.order_id);
            append_null(idx.state);
            append_null(idx.filled);
            append_null(idx.filled_decimal);
            append_null(idx.reason);
            append_null(idx.ts_open_ns);
            append_null(idx.ts_close_ns);
            append_null(idx.open);
            append_null(idx.high);
            append_null(idx.low);
            append_null(idx.close);
            append_null(idx.open_decimal);
            append_null(idx.high_decimal);
            append_null(idx.low_decimal);
            append_null(idx.close_decimal);
            append_null(idx.volume);
            append_null(idx.volume_decimal);
          } else if constexpr (std::is_same_v<T, OrderEvent>) {
            append_null(idx.side);
            append_value<arrow::DoubleBuilder>(idx.price, arg.price);  // Legacy
            append_value<arrow::DoubleBuilder>(idx.size, arg.size);    // Legacy
            append_null(idx.level);
            append_null(idx.op);
            // Dual-write decimal128
            append_decimal(idx.price_decimal, arg.price, 6);
            append_decimal(idx.size_decimal, arg.size, 3);
            append_null(idx.aggressor);
            append_value<arrow::StringBuilder>(idx.order_id, arg.order_id);
            append_value<arrow::Int8Builder>(idx.state, static_cast<int8_t>(arg.state));
            append_value<arrow::DoubleBuilder>(idx.filled, arg.filled);  // Legacy
            append_decimal(idx.filled_decimal, arg.filled, 3);  // Dual-write
            append_value<arrow::StringBuilder>(idx.reason, arg.reason);
            append_null(idx.ts_open_ns);
            append_null(idx.ts_close_ns);
            append_null(idx.open);
            append_null(idx.high);
            append_null(idx.low);
            append_null(idx.close);
            append_null(idx.open_decimal);
            append_null(idx.high_decimal);
            append_null(idx.low_decimal);
            append_null(idx.close_decimal);
            append_null(idx.volume);
            append_null(idx.volume_decimal);
          } else if constexpr (std::is_same_v<T, Bar>) {
            append_null(idx.side);
            append_null(idx.price);
            append_null(idx.size);
            append_null(idx.level);
            append_null(idx.op);
            append_null(idx.price_decimal);
            append_null(idx.size_decimal);
            append_null(idx.aggressor);
            append_null(idx.order_id);
            append_null(idx.state);
            append_null(idx.filled);
            append_null(idx.filled_decimal);
            append_null(idx.reason);
            append_value<arrow::Int64Builder>(idx.ts_open_ns, arg.ts_open_ns);
            append_value<arrow::Int64Builder>(idx.ts_close_ns, arg.ts_close_ns);
            append_value<arrow::DoubleBuilder>(idx.open, arg.open);  // Legacy
            append_value<arrow::DoubleBuilder>(idx.high, arg.high);  // Legacy
            append_value<arrow::DoubleBuilder>(idx.low, arg.low);    // Legacy
            append_value<arrow::DoubleBuilder>(idx.close, arg.close);  // Legacy
            // Dual-write decimal128
            append_decimal(idx.open_decimal, arg.open, 6);
            append_decimal(idx.high_decimal, arg.high, 6);
            append_decimal(idx.low_decimal, arg.low, 6);
            append_decimal(idx.close_decimal, arg.close, 6);
            append_value<arrow::DoubleBuilder>(idx.volume, arg.volume);  // Legacy
            append_decimal(idx.volume_decimal, arg.volume, 3);  // Dual-write
          } else {  // Heartbeat
            append_null(idx.side);
            append_null(idx.price);
            append_null(idx.size);
            append_null(idx.level);
            append_null(idx.op);
            append_null(idx.price_decimal);
            append_null(idx.size_decimal);
            append_null(idx.aggressor);
            append_null(idx.order_id);
            append_null(idx.state);
            append_null(idx.filled);
            append_null(idx.filled_decimal);
            append_null(idx.reason);
            append_null(idx.ts_open_ns);
            append_null(idx.ts_close_ns);
            append_null(idx.open);
            append_null(idx.high);
            append_null(idx.low);
            append_null(idx.close);
            append_null(idx.open_decimal);
            append_null(idx.high_decimal);
            append_null(idx.low_decimal);
            append_null(idx.close_decimal);
            append_null(idx.volume);
            append_null(idx.volume_decimal);
          }
        },
        event);
  }

  template <typename BuilderType, typename ValueType>
  void append_value(int idx, const ValueType& value) {
    // Handle dictionary builders specially
    if constexpr (std::is_same_v<ValueType, std::string>) {
      auto field = schema_->field(idx);
      if (field->type()->id() == arrow::Type::DICTIONARY) {
        auto dict_builder =
            dynamic_cast<arrow::StringDictionaryBuilder*>(builders_[idx].get());
        auto status = dict_builder->Append(value);
        if (!status.ok()) {
          throw std::runtime_error("Failed to append dict value: " + status.ToString());
        }
        return;
      }
    }

    // Regular builders
    auto builder = dynamic_cast<BuilderType*>(builders_[idx].get());
    auto status = builder->Append(value);
    if (!status.ok()) {
      throw std::runtime_error("Failed to append value: " + status.ToString());
    }
  }

  void append_null(int idx) {
    auto status = builders_[idx]->AppendNull();
    if (!status.ok()) {
      throw std::runtime_error("Failed to append null: " + status.ToString());
    }
  }

  // Append decimal128 value (dual-write helper)
  void append_decimal(int idx, double value, int scale) {
    auto builder = dynamic_cast<arrow::Decimal128Builder*>(builders_[idx].get());
    auto decimal_value = to_decimal128(value, scale);
    auto status = builder->Append(decimal_value);
    if (!status.ok()) {
      throw std::runtime_error("Failed to append decimal: " + status.ToString());
    }
  }

  void open_writer() {
    auto outfile_result = arrow::io::FileOutputStream::Open(filepath_);
    if (!outfile_result.ok()) {
      throw std::runtime_error("Failed to open output file: " +
                               outfile_result.status().ToString());
    }

    // Build Parquet properties with production tuning
    parquet::WriterProperties::Builder props_builder;
    props_builder.compression(parquet::Compression::ZSTD);
    props_builder.compression_level(3);
    
    // Row-group size: smaller groups for better pruning effectiveness
    // Target ~50MB row groups for balance between:
    // - Query pruning effectiveness (granular time ranges)
    // - Compression ratio (larger = better compression)
    // - Metadata size (more groups = more overhead)
    // Assuming ~200 bytes/row average, 250k rows ≈ 50MB
    props_builder.max_row_group_length(250000);
    
    // Data page size: 1MB for good compression/decompression granularity
    props_builder.data_pagesize(1024 * 1024);
    
    // Dictionary encoding for repetitive string columns
    props_builder.enable_dictionary();
    
    // Note: Bloom filters are configured per-column via ColumnProperties
    // in Arrow 21.0+. For now, we rely on dictionary encoding and 
    // row-group statistics for predicate pushdown.
    // TODO: Add column-specific Bloom filters in next iteration

    // Build Arrow properties with metadata
    auto metadata_map = metadata_.to_map();
    std::vector<std::string> keys, values;
    for (const auto& [key, value] : metadata_map) {
      keys.push_back(key);
      values.push_back(value);
    }
    auto kv_metadata = std::make_shared<arrow::KeyValueMetadata>(keys, values);
    
    auto arrow_props = parquet::ArrowWriterProperties::Builder()
                           .store_schema()
                           ->build();

    // Open FileWriter
    auto writer_result = parquet::arrow::FileWriter::Open(
        *schema_, arrow::default_memory_pool(), *outfile_result, 
        props_builder.build(), arrow_props);
    if (!writer_result.ok()) {
      throw std::runtime_error("Failed to create Parquet writer: " +
                               writer_result.status().ToString());
    }
    writer_ = std::move(*writer_result);

    // Write metadata to schema (Arrow doesn't support Parquet file metadata directly in v21)
    // Metadata will be stored in Arrow schema metadata instead
    auto schema_with_metadata = schema_->WithMetadata(kv_metadata);
    schema_ = schema_with_metadata;
  }

  void flush_batch() {
    if (current_batch_ == 0) return;

    // Finish arrays
    std::vector<std::shared_ptr<arrow::Array>> arrays;
    for (auto& builder : builders_) {
      std::shared_ptr<arrow::Array> array;
      auto status = builder->Finish(&array);
      if (!status.ok()) {
        throw std::runtime_error("Failed to finish array: " + status.ToString());
      }
      arrays.push_back(array);
    }

    // Create record batch
    auto batch = arrow::RecordBatch::Make(schema_, current_batch_, arrays);

    // Write batch (writer is already open)
    auto status = writer_->WriteRecordBatch(*batch);
    if (!status.ok()) {
      throw std::runtime_error("Failed to write batch: " + status.ToString());
    }

    // Reset builders for next batch
    for (auto& builder : builders_) {
      builder->Reset();
    }
    current_batch_ = 0;
  }

  std::string filepath_;        // Temp path during write
  std::string temp_filepath_;   // .partial path
  std::string final_filepath_;  // Final destination path
  std::shared_ptr<arrow::Schema> schema_;
  std::vector<std::unique_ptr<arrow::ArrayBuilder>> builders_;
  std::unique_ptr<parquet::arrow::FileWriter> writer_;
  FileMetadata metadata_;
  size_t batch_size_;
  size_t current_batch_;
  bool closed_;
  uint64_t total_rows_written_;
  uint64_t validation_errors_;
  std::optional<EventHeader> last_header_;  // For ordering validation
};

Writer::Writer(const std::string& filepath) : impl_(std::make_unique<Impl>(filepath)) {}

Writer::~Writer() { close(); }

Writer::Writer(Writer&&) noexcept = default;
Writer& Writer::operator=(Writer&&) noexcept = default;

bool Writer::append(const Event& event) {
  if (impl_->write(event)) {
    ++event_count_;
    return true;
  }
  return false;
}

void Writer::flush() { impl_->flush(); }

void Writer::close() {
  if (impl_) {
    impl_->close();
  }
}

uint64_t Writer::validation_errors() const {
  return impl_ ? impl_->validation_errors() : 0;
}

void Writer::set_ingest_session_id(const std::string& session_id) {
  if (impl_) {
    impl_->set_ingest_session_id(session_id);
  }
}

void Writer::set_feed_mode(const std::string& feed_mode) {
  if (impl_) {
    impl_->set_feed_mode(feed_mode);
  }
}

}  // namespace nexus::eventlog

