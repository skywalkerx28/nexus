#!/bin/bash
# Stop Nexus Ingestion Gracefully

set -e

NEXUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${NEXUS_ROOT}/nexus_ingest.pid"

if [ ! -f "${PID_FILE}" ]; then
  echo "No PID file found. Ingestion is not running."
  exit 0
fi

PID=$(cat "${PID_FILE}")

if ! ps -p ${PID} > /dev/null 2>&1; then
  echo "Process ${PID} is not running. Removing stale PID file."
  rm -f "${PID_FILE}"
  exit 0
fi

echo "Stopping Nexus ingestion (PID: ${PID})..."
kill -SIGTERM ${PID}

# Wait for graceful shutdown (up to 30 seconds)
for i in {1..30}; do
  if ! ps -p ${PID} > /dev/null 2>&1; then
    echo "Ingestion stopped gracefully"
    rm -f "${PID_FILE}"
    exit 0
  fi
  sleep 1
done

# Force kill if still running
echo "Graceful shutdown timed out, forcing kill..."
kill -SIGKILL ${PID} 2>/dev/null || true
rm -f "${PID_FILE}"
echo "Ingestion stopped (forced)"

