#!/bin/bash
# Stop Nexus Observatory gracefully

set -e

echo "=========================================="
echo "STOPPING NEXUS OBSERVATORY"
echo "=========================================="

NEXUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${NEXUS_ROOT}/logs"

# Stop Observatory UI
if [ -f "${LOG_DIR}/observatory_ui.pid" ]; then
    UI_PID=$(cat "${LOG_DIR}/observatory_ui.pid")
    if kill -0 "$UI_PID" 2>/dev/null; then
        echo "Stopping Observatory UI (PID: $UI_PID)..."
        kill -TERM "$UI_PID" 2>/dev/null || true
        rm "${LOG_DIR}/observatory_ui.pid"
    fi
fi

# Stop Observability API
if [ -f "${LOG_DIR}/observability_api.pid" ]; then
    OBS_PID=$(cat "${LOG_DIR}/observability_api.pid")
    if kill -0 "$OBS_PID" 2>/dev/null; then
        echo "Stopping Observability API (PID: $OBS_PID)..."
        kill -TERM "$OBS_PID" 2>/dev/null || true
        rm "${LOG_DIR}/observability_api.pid"
    fi
fi

# Optionally stop Prometheus (comment out if you want it to keep running)
if [ -f "${LOG_DIR}/prometheus.pid" ]; then
    PROM_PID=$(cat "${LOG_DIR}/prometheus.pid")
    if kill -0 "$PROM_PID" 2>/dev/null; then
        echo "Stopping Prometheus (PID: $PROM_PID)..."
        kill -TERM "$PROM_PID" 2>/dev/null || true
        rm "${LOG_DIR}/prometheus.pid"
    fi
fi

echo ""
echo "Observatory stopped successfully"
echo ""

