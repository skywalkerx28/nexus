# Getting Started with Nexus Phase 0

This guide will get you up and running with the Phase 0 foundation.

## Prerequisites

Before you begin, ensure you have:

- **macOS or Linux** (Windows via WSL2)
- **C++20 compiler:** clang 14+ or gcc 11+
- **CMake 3.20+**
- **Python 3.11+**
- **Node.js 20+**
- **Git**

## Quick Start (5 minutes)

### 1. Clone and Setup

```bash
# Clone repository
git clone <repo-url>
cd nexus

# Run automated setup
make setup
```

This will:
- Install pre-commit hooks
- Build C++ components
- Install Python dependencies
- Install UI dependencies
- Create data directories
- Run all tests

### 2. Start Development Environment

```bash
# Start all services (API + UI)
make dev
```

This starts:
- **Observability API** on http://localhost:9400
- **Observatory UI** on http://localhost:3000

### 3. Verify Installation

Open your browser to http://localhost:3000

You should see:
- System Health: "healthy"
- Latency SLOs (mock data)
- Symbol Tiles (mock data)
- Log Tail

## Manual Setup (if automated fails)

### Step 1: Install Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

### Step 2: Build C++ Components

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

### Step 3: Install Python Dependencies

```bash
pip install -e ".[dev]"
```

### Step 4: Install UI Dependencies

```bash
cd ui/observatory
pnpm install
cd ../..
```

### Step 5: Create Data Directories

```bash
mkdir -p data/parquet logs
```

### Step 6: Run Tests

```bash
# C++ tests
cd build && ctest --output-on-failure && cd ..

# Python tests
pytest py/tests/ -v

# UI tests (optional)
cd ui/observatory && pnpm test && cd ../..
```

## Starting Services Manually

### Terminal 1: Observability API

```bash
python -m ops.observability_api.main
```

Expected output:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:9400
```

### Terminal 2: Observatory UI

```bash
cd ui/observatory
pnpm dev
```

Expected output:
```
  ▲ Next.js 14.1.0
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

## Verifying the Installation

### 1. Check API Health

```bash
curl http://localhost:9400/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-09T...",
  "version": "0.1.0",
  "uptime_seconds": 12.34
}
```

### 2. Check Metrics Endpoint

```bash
curl http://localhost:9400/metrics
```

Expected: Prometheus-format metrics

### 3. Check UI

Visit http://localhost:3000 and verify:
- No API connection errors
- Health status shows "healthy"
- All components render

## Common Issues

### Issue: "CMake not found"

**Solution:**
```bash
# macOS
brew install cmake

# Ubuntu/Debian
sudo apt-get install cmake

# Verify
cmake --version  # Should be 3.20+
```

### Issue: "Python version too old"

**Solution:**
```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3.11

# Verify
python3 --version  # Should be 3.11+
```

### Issue: "pnpm not found"

**Solution:**
```bash
npm install -g pnpm

# Verify
pnpm --version
```

### Issue: "Arrow/Parquet not found"

**Solution:**
```bash
# macOS
brew install apache-arrow

# Ubuntu/Debian
sudo apt-get install libarrow-dev libparquet-dev

# Note: EventLog uses placeholder impl in Phase 0
# Full Arrow integration in Phase 1
```

### Issue: "Port 9400 already in use"

**Solution:**
```bash
# Find process using port
lsof -i :9400

# Kill process
kill -9 <PID>

# Or change port in configs/base.yaml
```

### Issue: "UI shows 'API disconnected'"

**Solution:**
1. Ensure API is running: `curl http://localhost:9400/health`
2. Check CORS settings in `ops/observability_api/main.py`
3. Verify `NEXT_PUBLIC_API_URL` in `.env` (if using)

## Development Workflow

### Running Tests

```bash
# All tests
make test

# C++ only
make test-cpp

# Python only
make test-py
```

### Code Formatting

```bash
# Format all code
make format

# Check formatting (CI mode)
make lint
```

### Building C++

```bash
# Full rebuild
make clean
make build

# Incremental build
cmake --build build -j
```

### Stopping Services

```bash
# If started with make dev
make stop

# Or manually
pkill -f "observability_api.main"
pkill -f "next dev"
```

## Next Steps

Now that Phase 0 is running, you're ready for Phase 1!

### Phase 1 Preview: Ingestion & L1 Book

1. **Install IBKR Gateway**
   - Follow: `docs/runbooks/ibkr-setup.md`
   - Test paper trading connection

2. **Implement IBKR FeedAdapter**
   - Connect to IB Gateway
   - Subscribe to market data
   - Normalize to EventLog schema

3. **Build L1 OrderBook**
   - C++ implementation with invariants
   - Python bindings
   - Live data in UI

### Recommended Reading

- `README.md` - Project overview and quick reference
- `readme` - Full project vision and roadmap
- `context.md` - System architecture for developers
- `docs/runbooks/ibkr-setup.md` - IBKR Gateway setup
- `docs/phase0-summary.md` - Phase 0 deliverables

## Getting Help

### Documentation

- **Architecture:** See `context.md`
- **Runbooks:** See `docs/runbooks/`
- **API Docs:** http://localhost:9400/docs (when API is running)

### Troubleshooting

1. Check logs: `tail -f logs/*.log`
2. Verify services: `curl http://localhost:9400/health`
3. Check CI: `.github/workflows/ci.yml`

### Support

- Internal: `#nexus-support` channel
- Issues: GitHub Issues (if applicable)

---

**Welcome to Nexus!**

You've successfully set up Phase 0. The foundation is solid, and we're ready to build the world's best algorithmic trading platform.

*Excellence is our standard. Let's build something remarkable.*

