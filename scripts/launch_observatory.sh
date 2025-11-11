#!/bin/bash
# Launch Nexus Observatory - Complete stack
# Starts: Prometheus, Observability API, Observatory UI

set -e

echo "=========================================="
echo "NEXUS OBSERVATORY LAUNCHER"
echo "Starting complete monitoring stack..."
echo "=========================================="
echo ""

# Colors for output
NC='\033[0m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'

NEXUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${NEXUS_ROOT}/logs"
mkdir -p "$LOG_DIR"

# Check if Prometheus is running
echo -e "${BLUE}[1/3]${NC} Checking Prometheus..."
if ! pgrep -x "prometheus" > /dev/null; then
    echo -e "${YELLOW}Prometheus not running. Starting...${NC}"
    
    # Check if Homebrew Prometheus is installed
    if command -v prometheus &> /dev/null; then
        echo "Starting Prometheus server..."
        prometheus --config.file=/usr/local/etc/prometheus.yml \
                   --storage.tsdb.path=/usr/local/var/prometheus \
                   > "${LOG_DIR}/prometheus.log" 2>&1 &
        PROM_PID=$!
        echo "Prometheus started (PID: $PROM_PID)"
        sleep 3
    else
        echo -e "${YELLOW}Prometheus not installed. Install with: brew install prometheus${NC}"
        echo "Continuing without Prometheus (metrics will fail)..."
    fi
else
    echo -e "${GREEN}Prometheus already running${NC}"
fi

# Start Observability API
echo ""
echo -e "${BLUE}[2/3]${NC} Starting Observability API..."
cd "$NEXUS_ROOT"

# Set environment variables
export PROMETHEUS_URL="http://localhost:9090"
export OBSERVATORY_API_TOKEN="dev-token-12345"
export CACHE_TTL_SECONDS="5"
export RATE_LIMIT_PER_MINUTE="1000"

# Add nexus to PYTHONPATH
export PYTHONPATH="${NEXUS_ROOT}/py:${PYTHONPATH}"

# Start Observability API in background
python3 -m uvicorn nexus.ops.observability_api:app \
        --host 0.0.0.0 \
        --port 8001 \
        --log-level info \
        > "${LOG_DIR}/observability_api.log" 2>&1 &
OBS_PID=$!

echo "Observability API started (PID: $OBS_PID)"
echo "  Endpoint: http://localhost:8001"
echo "  Health:   http://localhost:8001/health"
echo "  Logs:     ${LOG_DIR}/observability_api.log"
sleep 2

# Start Observatory UI
echo ""
echo -e "${BLUE}[3/3]${NC} Starting Observatory UI..."
cd "$NEXUS_ROOT/ui/observatory"

# Set environment for Next.js
export OBSERVABILITY_API_URL="http://localhost:8001"
export OBSERVATORY_API_TOKEN="dev-token-12345"

# Start Next.js development server
npm run dev > "${LOG_DIR}/observatory_ui.log" 2>&1 &
UI_PID=$!

echo "Observatory UI started (PID: $UI_PID)"
echo "  Dashboard: http://localhost:3000/dashboard"
echo "  Logs:      ${LOG_DIR}/observatory_ui.log"

# Save PIDs for shutdown
echo "$OBS_PID" > "${LOG_DIR}/observability_api.pid"
echo "$UI_PID" > "${LOG_DIR}/observatory_ui.pid"
if [ ! -z "$PROM_PID" ]; then
    echo "$PROM_PID" > "${LOG_DIR}/prometheus.pid"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}OBSERVATORY LAUNCHED SUCCESSFULLY${NC}"
echo "=========================================="
echo ""
echo "Services:"
echo "  Prometheus:       http://localhost:9090"
echo "  Observability API: http://localhost:8001"
echo "  Observatory UI:    http://localhost:3000/dashboard"
echo ""
echo "Logs:"
echo "  tail -f ${LOG_DIR}/observatory_ui.log"
echo "  tail -f ${LOG_DIR}/observability_api.log"
echo ""
echo "To stop:"
echo "  ./scripts/stop_observatory.sh"
echo ""
echo "Waiting for UI to start (30 seconds)..."
sleep 30

# Check if services are healthy
echo ""
echo "Health checks:"
curl -s http://localhost:9090/-/healthy > /dev/null && echo -e "  Prometheus:    ${GREEN}OK${NC}" || echo -e "  Prometheus:    ${YELLOW}NOT READY${NC}"
curl -s http://localhost:8001/health > /dev/null && echo -e "  Observability: ${GREEN}OK${NC}" || echo -e "  Observability: ${YELLOW}NOT READY${NC}"
curl -s http://localhost:3000 > /dev/null && echo -e "  Observatory:   ${GREEN}OK${NC}" || echo -e "  Observatory:   ${YELLOW}NOT READY${NC}"

echo ""
echo -e "${GREEN}Ready! Open http://localhost:3000/dashboard${NC}"
echo ""

