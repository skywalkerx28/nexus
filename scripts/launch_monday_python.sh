#!/bin/bash
# Nexus Autonomous Launch Script for Monday Market Open (Python IBKR Adapter)
# This script will start ingestion and run autonomously

set -e

echo "======================================"
echo "Nexus Autonomous Launch - Monday"
echo "Python IBKR Adapter (ib_insync)"
echo "======================================"
echo ""

# Configuration
NEXUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_SCRIPT="${NEXUS_ROOT}/py/nexus/ingest/ibkr_feed.py"
LOG_DIR="${NEXUS_ROOT}/logs"
DATA_DIR="${NEXUS_ROOT}/data/parquet"
PID_FILE="${NEXUS_ROOT}/nexus_ingest_python.pid"

# IB Gateway configuration (from your screenshot)
IBKR_HOST="${IBKR_HOST:-127.0.0.1}"
IBKR_PORT="${IBKR_PORT:-4001}"
CLIENT_ID="${CLIENT_ID:-42}"

# Symbols to track (can be customized via env var)
SYMBOLS="${SYMBOLS:-AAPL MSFT SPY QQQ TSLA NVDA GOOGL AMZN META NFLX}"

# Create directories
mkdir -p "${LOG_DIR}"
mkdir -p "${DATA_DIR}"

# Check if already running
if [ -f "${PID_FILE}" ]; then
  OLD_PID=$(cat "${PID_FILE}")
  if ps -p "${OLD_PID}" > /dev/null 2>&1; then
    echo "ERROR: Nexus ingestion is already running (PID: ${OLD_PID})"
    echo "To stop: kill ${OLD_PID}"
    exit 1
  else
    echo "Removing stale PID file"
    rm -f "${PID_FILE}"
  fi
fi

# Check if Python script exists
if [ ! -f "${PYTHON_SCRIPT}" ]; then
  echo "ERROR: Python script not found: ${PYTHON_SCRIPT}"
  exit 1
fi

# Check if ib_insync is installed
if ! python3 -c "import ib_insync" 2>/dev/null; then
  echo "ERROR: ib_insync not installed"
  echo "Install with: pip install ib_insync"
  exit 1
fi

# Check if EventLog Python bindings exist
EVENTLOG_PY="${NEXUS_ROOT}/build/cpp/eventlog/eventlog_py.cpython-*.so"
if ! ls ${EVENTLOG_PY} 1> /dev/null 2>&1; then
  echo "ERROR: EventLog Python bindings not found"
  echo "Build with: make build"
  exit 1
fi

# Start ingestion
echo "Starting Nexus ingestion..."
echo "  IB Gateway: ${IBKR_HOST}:${IBKR_PORT}"
echo "  Client ID: ${CLIENT_ID}"
echo "  Symbols: ${SYMBOLS}"
echo "  Data dir: ${DATA_DIR}"
echo "  Log dir: ${LOG_DIR}"
echo ""

# Convert SYMBOLS to array for Python
SYMBOL_ARGS=""
for sym in ${SYMBOLS}; do
  SYMBOL_ARGS="${SYMBOL_ARGS} ${sym}"
done

# Run in background with nohup
LOG_FILE="${LOG_DIR}/nexus_ingest_$(date +%Y%m%d_%H%M%S).log"

nohup python3 "${PYTHON_SCRIPT}" \
  --host "${IBKR_HOST}" \
  --port "${IBKR_PORT}" \
  --client-id "${CLIENT_ID}" \
  --symbols ${SYMBOL_ARGS} \
  --parquet-dir "${DATA_DIR}" \
  > "${LOG_FILE}" 2>&1 &

INGEST_PID=$!
echo ${INGEST_PID} > "${PID_FILE}"

# Wait a moment to check if it started successfully
sleep 3

if ps -p ${INGEST_PID} > /dev/null 2>&1; then
  echo "Nexus ingestion started successfully!"
  echo "  PID: ${INGEST_PID}"
  echo "  Log: ${LOG_FILE}"
  echo ""
  echo "To monitor: tail -f ${LOG_FILE}"
  echo "To stop: ./scripts/stop_ingestion_python.sh  (or: kill ${INGEST_PID})"
  echo ""
  echo "Nexus is now running autonomously!"
  echo ""
  echo "Data will be written to:"
  echo "  ${DATA_DIR}/{SYMBOL}/YYYY/MM/DD.parquet"
else
  echo "ERROR: Failed to start ingestion"
  echo "Check log: ${LOG_FILE}"
  rm -f "${PID_FILE}"
  exit 1
fi

