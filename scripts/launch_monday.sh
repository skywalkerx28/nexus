#!/bin/bash
# Nexus Autonomous Launch Script for Monday Market Open
# This script will start ingestion and run autonomously

set -e

echo "======================================"
echo "Nexus Autonomous Launch - Monday"
echo "======================================"
echo ""

# Configuration
NEXUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INGEST_BIN="${NEXUS_ROOT}/build/cpp/ingest/ibkr/nexus_ingest"
LOG_DIR="${NEXUS_ROOT}/logs"
DATA_DIR="${NEXUS_ROOT}/data/parquet"
PID_FILE="${NEXUS_ROOT}/nexus_ingest.pid"

# Symbols to track (can be customized)
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

# Check if binary exists
if [ ! -f "${INGEST_BIN}" ]; then
  echo "ERROR: Ingestion binary not found: ${INGEST_BIN}"
  echo "Please build first: make build"
  exit 1
fi

# Start ingestion
echo "Starting Nexus ingestion..."
echo "  Symbols: ${SYMBOLS}"
echo "  Data dir: ${DATA_DIR}"
echo "  Log dir: ${LOG_DIR}"
echo ""

# Run in background with nohup
nohup "${INGEST_BIN}" ${SYMBOLS} \
  > "${LOG_DIR}/nexus_ingest_$(date +%Y%m%d_%H%M%S).log" 2>&1 &

INGEST_PID=$!
echo ${INGEST_PID} > "${PID_FILE}"

# Wait a moment to check if it started successfully
sleep 2

if ps -p ${INGEST_PID} > /dev/null 2>&1; then
  echo "Nexus ingestion started successfully!"
  echo "  PID: ${INGEST_PID}"
  echo "  Log: ${LOG_DIR}/nexus_ingest_$(date +%Y%m%d_%H%M%S).log"
  echo ""
  echo "To monitor: tail -f ${LOG_DIR}/nexus_ingest_*.log"
  echo "To stop: kill ${INGEST_PID}  (or: kill \$(cat ${PID_FILE}))"
  echo ""
  echo "Nexus is now running autonomously!"
else
  echo "ERROR: Failed to start ingestion"
  rm -f "${PID_FILE}"
  exit 1
fi

