#include "nexus/eventlog/reader.hpp"
#include "nexus/eventlog/schema.hpp"
#include "nexus/eventlog/writer.hpp"
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
      .def_readwrite("venue", &EventHeader::venue)
      .def_readwrite("symbol", &EventHeader::symbol)
      .def_readwrite("source", &EventHeader::source)
      .def_readwrite("seq", &EventHeader::seq);

  // Writer
  py::class_<Writer>(m, "Writer")
      .def(py::init<const std::string&>())
      .def("flush", &Writer::flush)
      .def("close", &Writer::close)
      .def("event_count", &Writer::event_count);

  // Reader
  py::class_<Reader>(m, "Reader")
      .def(py::init<const std::string&>())
      .def("reset", &Reader::reset)
      .def("event_count", &Reader::event_count);
}

