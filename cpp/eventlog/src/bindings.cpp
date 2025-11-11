#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
#include "nexus/eventlog/partitioner.hpp"
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

namespace py = pybind11;
using namespace nexus::eventlog;

PYBIND11_MODULE(eventlog_py, m) {
  m.doc() = "Nexus EventLog Python bindings";

  // Enums
  py::enum_<EventType>(m, "EventType")
      .value("DEPTH_UPDATE", EventType::DEPTH_UPDATE)
      .value("TRADE", EventType::TRADE)
      .value("ORDER_EVENT", EventType::ORDER_EVENT)
      .value("BAR", EventType::BAR)
      .value("HEARTBEAT", EventType::HEARTBEAT);

  py::enum_<Side>(m, "Side").value("BID", Side::BID).value("ASK", Side::ASK);

  py::enum_<DepthOp>(m, "DepthOp")
      .value("ADD", DepthOp::ADD)
      .value("UPDATE", DepthOp::UPDATE)
      .value("DELETE", DepthOp::DELETE);

  py::enum_<Aggressor>(m, "Aggressor")
      .value("BUY", Aggressor::BUY)
      .value("SELL", Aggressor::SELL)
      .value("UNKNOWN", Aggressor::UNKNOWN);

  py::enum_<OrderState>(m, "OrderState")
      .value("NEW", OrderState::NEW)
      .value("ACK", OrderState::ACK)
      .value("REPLACED", OrderState::REPLACED)
      .value("CANCELED", OrderState::CANCELED)
      .value("FILLED", OrderState::FILLED)
      .value("REJECTED", OrderState::REJECTED);

  // EventHeader
  py::class_<EventHeader>(m, "EventHeader")
      .def(py::init<>())
      .def_readwrite("ts_event_ns", &EventHeader::ts_event_ns)
      .def_readwrite("ts_receive_ns", &EventHeader::ts_receive_ns)
      .def_readwrite("ts_monotonic_ns", &EventHeader::ts_monotonic_ns)
      .def_readwrite("venue", &EventHeader::venue)
      .def_readwrite("symbol", &EventHeader::symbol)
      .def_readwrite("source", &EventHeader::source)
      .def_readwrite("seq", &EventHeader::seq);

  // Trade
  py::class_<Trade>(m, "Trade")
      .def(py::init<>())
      .def_readwrite("header", &Trade::header)
      .def_readwrite("price", &Trade::price)
      .def_readwrite("size", &Trade::size)
      .def_readwrite("aggressor", &Trade::aggressor);

  // DepthUpdate
  py::class_<DepthUpdate>(m, "DepthUpdate")
      .def(py::init<>())
      .def_readwrite("header", &DepthUpdate::header)
      .def_readwrite("side", &DepthUpdate::side)
      .def_readwrite("price", &DepthUpdate::price)
      .def_readwrite("size", &DepthUpdate::size)
      .def_readwrite("level", &DepthUpdate::level)
      .def_readwrite("op", &DepthUpdate::op);

  // Writer
  py::class_<Writer>(m, "Writer")
      .def(py::init<const std::string&>())
      .def("append_trade", [](Writer& w, const Trade& t) { return w.append(t); })
      .def("append_depth", [](Writer& w, const DepthUpdate& d) { return w.append(d); })
      .def("flush", &Writer::flush)
      .def("close", &Writer::close)
      .def("event_count", &Writer::event_count)
      .def("validation_errors", &Writer::validation_errors)
      .def("set_ingest_session_id", &Writer::set_ingest_session_id)
      .def("set_feed_mode", &Writer::set_feed_mode);

  // Reader
  py::class_<Reader>(m, "Reader")
      .def(py::init<const std::string&>())
      .def("reset", &Reader::reset)
      .def("event_count", &Reader::event_count)
      .def("row_group_count", &Reader::row_group_count)
      .def("row_groups_touched", &Reader::row_groups_touched)
      .def("set_time_range", &Reader::set_time_range)
      .def("set_seq_range", &Reader::set_seq_range)
      .def("clear_filters", &Reader::clear_filters)
      .def("get_metadata", [](const Reader& r) {
        // Convert FileMetadata to Python dict for usability
        auto metadata = r.get_metadata();
        auto metadata_map = metadata.to_map();
        py::dict result;
        for (const auto& [key, value] : metadata_map) {
          result[py::str(key)] = py::str(value);
        }
        return result;
      });
  
  // FileMetadata
  py::class_<FileMetadata>(m, "FileMetadata")
      .def(py::init<>())
      .def_readonly("schema_version", &FileMetadata::schema_version)
      .def_readonly("nexus_version", &FileMetadata::nexus_version)
      .def_readonly("ingest_session_id", &FileMetadata::ingest_session_id)
      .def_readonly("feed_mode", &FileMetadata::feed_mode)
      .def_readonly("ingest_start_ns", &FileMetadata::ingest_start_ns)
      .def_readonly("ingest_end_ns", &FileMetadata::ingest_end_ns)
      .def_readonly("symbol", &FileMetadata::symbol)
      .def_readonly("venue", &FileMetadata::venue)
      .def_readonly("source", &FileMetadata::source)
      .def_readonly("ingest_host", &FileMetadata::ingest_host)
      .def_readonly("write_complete", &FileMetadata::write_complete);
  
  // Partitioner
  py::class_<Partitioner>(m, "Partitioner")
      .def_static("get_path", 
          py::overload_cast<const std::string&, const std::string&, int64_t>(
              &Partitioner::get_path),
          py::arg("base_dir"), py::arg("symbol"), py::arg("ts_ns"));
}

