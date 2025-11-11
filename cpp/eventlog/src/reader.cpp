#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/arrow_schema.hpp"
#include "nexus/eventlog/metadata.hpp"
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/reader.h>
#include <parquet/statistics.h>
#include <cstring>
#include <iostream>
#include <stdexcept>

namespace nexus::eventlog {

// Arrow/Parquet implementation with streaming RecordBatch reader
class Reader::Impl {
 private:
  struct RowGroupStats {
    int row_group_id;
    int64_t num_rows;
    std::string ts_event_min;  // Encoded bytes
    std::string ts_event_max;
    std::string seq_min_str;
    std::string seq_max_str;
    int64_t ts_min{0};  // Decoded values
    int64_t ts_max{0};
    uint64_t seq_min{0};
    uint64_t seq_max{0};
    bool has_ts_stats{false};
    bool has_seq_stats{false};
  };
  
 public:
  explicit Impl(const std::string& filepath)
      : filepath_(filepath),
        current_batch_idx_(0),
        current_row_in_batch_(0),
        total_rows_(0),
        batch_reader_exhausted_(false),
        time_filter_enabled_(false),
        seq_filter_enabled_(false),
        time_start_ns_(0),
        time_end_ns_(INT64_MAX),
        seq_min_(0),
        seq_max_(UINT64_MAX),
        current_row_group_idx_(0),
        row_groups_touched_(0) {
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
    
    // Build row-group index for pruning (before creating readers)
    build_row_group_index();
    
    // Initialize selective row-group reading
    // Note: batch_reader_ will be created lazily per row-group
  }
  
  void build_row_group_index() {
    // Scan row-group statistics to enable smart pruning
    auto parquet_metadata = parquet_reader_->parquet_reader()->metadata();
    int num_row_groups = parquet_metadata->num_row_groups();
    
    const auto& idx = ArrowSchema::indices();
    
    for (int rg = 0; rg < num_row_groups; ++rg) {
      auto row_group = parquet_metadata->RowGroup(rg);
      
      RowGroupStats stats;
      stats.row_group_id = rg;
      stats.num_rows = row_group->num_rows();
      
      // Get ts_event_ns statistics (for time-range pruning)
      auto ts_col = row_group->ColumnChunk(idx.ts_event_ns);
      if (ts_col->is_stats_set()) {
        auto ts_stats = ts_col->statistics();
        if (ts_stats->HasMinMax()) {
          // EncodeMin/Max return std::string directly in Arrow 21
          stats.ts_event_min = ts_stats->EncodeMin();
          stats.ts_event_max = ts_stats->EncodeMax();
          
          // Verify we have valid encoded statistics (should be 8 bytes for int64)
          if (stats.ts_event_min.size() == sizeof(int64_t) && 
              stats.ts_event_max.size() == sizeof(int64_t)) {
            // Extract int64_t from encoded bytes (safe memcpy, no alignment/endian assumptions)
            std::memcpy(&stats.ts_min, stats.ts_event_min.data(), sizeof(int64_t));
            std::memcpy(&stats.ts_max, stats.ts_event_max.data(), sizeof(int64_t));
            stats.has_ts_stats = true;
          }
        }
      }
      
      // Get seq statistics (for sequence-range pruning)
      auto seq_col = row_group->ColumnChunk(idx.seq);
      if (seq_col->is_stats_set()) {
        auto seq_stats = seq_col->statistics();
        if (seq_stats->HasMinMax()) {
          // EncodeMin/Max return std::string directly in Arrow 21
          stats.seq_min_str = seq_stats->EncodeMin();
          stats.seq_max_str = seq_stats->EncodeMax();
          
          // Verify we have valid encoded statistics (should be 8 bytes for uint64/int64)
          if (stats.seq_min_str.size() == sizeof(uint64_t) && 
              stats.seq_max_str.size() == sizeof(uint64_t)) {
            // Extract uint64_t from encoded bytes (safe memcpy, no alignment/endian assumptions)
            // Note: Parquet physically stores uint64 as int64, but we read the bytes directly
            std::memcpy(&stats.seq_min, stats.seq_min_str.data(), sizeof(uint64_t));
            std::memcpy(&stats.seq_max, stats.seq_max_str.data(), sizeof(uint64_t));
            stats.has_seq_stats = true;
          }
        }
      }
      
      row_group_stats_.push_back(stats);
    }
    
    // Log statistics summary for debugging
    if (!row_group_stats_.empty()) {
      std::cout << "EventLog Reader: Built index for " << row_group_stats_.size() 
                << " row groups covering " << total_rows_ << " events" << std::endl;
    }
  }
  
  bool row_group_passes_filters(const RowGroupStats& stats) const {
    // Time-range pruning
    if (time_filter_enabled_ && stats.has_ts_stats) {
      // Row group is entirely before filter range
      if (stats.ts_max < time_start_ns_) {
        return false;
      }
      // Row group is entirely after filter range
      if (stats.ts_min > time_end_ns_) {
        return false;
      }
    }
    
    // Sequence-range pruning
    if (seq_filter_enabled_ && stats.has_seq_stats) {
      // Row group is entirely before filter range
      if (stats.seq_max < seq_min_) {
        return false;
      }
      // Row group is entirely after filter range
      if (stats.seq_min > seq_max_) {
        return false;
      }
    }
    
    return true;  // Row group may contain matching rows
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
    while (true) {
      // Load next batch if needed
      if (!current_batch_ || current_row_in_batch_ >= current_batch_->num_rows()) {
        if (!load_next_batch()) {
          return std::nullopt;
        }
      }

      // Read event from current batch
      auto event = read_event_at(current_row_in_batch_);
      current_row_in_batch_++;
      
      // Apply filters
      const auto& header = std::visit([](const auto& e) -> const EventHeader& {
        return e.header;
      }, event);
      
      if (passes_filters(header)) {
        return event;  // Event passes all filters
      }
      // Otherwise, continue to next event
    }
  }

  void reset() {
    // Reset to beginning of row-group sequence
    batch_reader_.reset();
    current_batch_.reset();
    current_batch_idx_ = 0;
    current_row_in_batch_ = 0;
    current_row_group_idx_ = 0;
    batch_reader_exhausted_ = true;  // Force load_next_row_group() on next read
    row_groups_touched_ = 0;
  }

  uint64_t count() const { return total_rows_; }
  
  int row_group_count() const { return static_cast<int>(row_group_stats_.size()); }
  
  int row_groups_touched() const { return row_groups_touched_; }
  
  FileMetadata get_metadata() const {
    // Extract metadata from Arrow schema metadata
    if (!schema_ || !schema_->metadata()) {
      return FileMetadata{};  // Return empty if no metadata
    }
    
    // Convert Arrow KeyValueMetadata to std::map
    auto kv_metadata = schema_->metadata();
    std::map<std::string, std::string> metadata_map;
    
    for (int64_t i = 0; i < kv_metadata->size(); ++i) {
      metadata_map[kv_metadata->key(i)] = kv_metadata->value(i);
    }
    
    return FileMetadata::from_map(metadata_map);
  }
  
  void set_time_range(int64_t start_ns, int64_t end_ns) {
    time_filter_enabled_ = true;
    time_start_ns_ = start_ns;
    time_end_ns_ = end_ns;
  }
  
  void set_seq_range(uint64_t min_seq, uint64_t max_seq) {
    seq_filter_enabled_ = true;
    seq_min_ = min_seq;
    seq_max_ = max_seq;
  }
  
  void clear_filters() {
    time_filter_enabled_ = false;
    seq_filter_enabled_ = false;
    time_start_ns_ = 0;
    time_end_ns_ = INT64_MAX;
    seq_min_ = 0;
    seq_max_ = UINT64_MAX;
  }

 private:
  bool load_next_batch() {
    while (true) {
      // If current row-group reader exhausted, move to next matching row-group
      if (!batch_reader_ || batch_reader_exhausted_) {
        if (!load_next_row_group()) {
          return false;  // No more row groups
        }
      }
      
      // Read next batch from current row-group
      auto status = batch_reader_->ReadNext(&current_batch_);
      if (!status.ok()) {
        throw std::runtime_error("Failed to read next batch: " + status.ToString());
      }

      if (!current_batch_) {
        // Current row-group exhausted, try next one
        batch_reader_exhausted_ = true;
        continue;
      }

      current_row_in_batch_ = 0;
      current_batch_idx_++;
      return true;
    }
  }
  
  bool load_next_row_group() {
    // Find next row-group that passes filters
    while (current_row_group_idx_ < static_cast<int>(row_group_stats_.size())) {
      const auto& stats = row_group_stats_[current_row_group_idx_];
      
      // Check if this row-group matches our filters (IO-level pruning!)
      if (row_group_passes_filters(stats)) {
        // Create reader for this specific row-group
        std::vector<int> row_group_indices = {stats.row_group_id};
        auto rg_reader_result = parquet_reader_->GetRecordBatchReader(row_group_indices);
        if (!rg_reader_result.ok()) {
          throw std::runtime_error("Failed to create row-group reader: " +
                                   rg_reader_result.status().ToString());
        }
        batch_reader_ = std::move(*rg_reader_result);
        batch_reader_exhausted_ = false;
        row_groups_touched_++;
        current_row_group_idx_++;
        return true;
      }
      
      // Skip this row-group entirely (no IO!)
      current_row_group_idx_++;
    }
    
    // No more matching row-groups
    return false;
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

  bool passes_filters(const EventHeader& header) const {
    // Check time range filter
    if (time_filter_enabled_) {
      if (header.ts_event_ns < time_start_ns_ || header.ts_event_ns > time_end_ns_) {
        return false;
      }
    }
    
    // Check sequence range filter
    if (seq_filter_enabled_) {
      if (header.seq < seq_min_ || header.seq > seq_max_) {
        return false;
      }
    }
    
    return true;
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
  
  // Filter state
  bool time_filter_enabled_;
  bool seq_filter_enabled_;
  int64_t time_start_ns_;
  int64_t time_end_ns_;
  uint64_t seq_min_;
  uint64_t seq_max_;
  
  // Row-group statistics for pruning
  std::vector<RowGroupStats> row_group_stats_;
  int current_row_group_idx_;   // Current row-group being read
  int row_groups_touched_;       // Counter for pruning effectiveness
};

Reader::Reader(const std::string& filepath) : impl_(std::make_unique<Impl>(filepath)) {}

Reader::~Reader() = default;

Reader::Reader(Reader&&) noexcept = default;
Reader& Reader::operator=(Reader&&) noexcept = default;

std::optional<Event> Reader::next() { return impl_->read(); }

void Reader::reset() { impl_->reset(); }

uint64_t Reader::event_count() const { return impl_->count(); }

void Reader::set_time_range(int64_t start_ns, int64_t end_ns) {
  impl_->set_time_range(start_ns, end_ns);
}

void Reader::set_seq_range(uint64_t min_seq, uint64_t max_seq) {
  impl_->set_seq_range(min_seq, max_seq);
}

void Reader::clear_filters() {
  impl_->clear_filters();
}

int Reader::row_group_count() const {
  return impl_->row_group_count();
}

int Reader::row_groups_touched() const {
  return impl_->row_groups_touched();
}

FileMetadata Reader::get_metadata() const {
  return impl_->get_metadata();
}

}  // namespace nexus::eventlog

