# Nexus

**Syntropic's flagship, research-grade algorithmic trading platform**

> *Automated, intelligent systems that turn market noise into self-improving, maintainable processes*

[![Phase](https://img.shields.io/badge/Phase-0%20Complete-success)]()
[![Status](https://img.shields.io/badge/Status-Ready%20for%20Phase%201-blue)]()

---

## Overview

**Nexus** is an engine designed to **bootstrap Syntropic's financial independence** and continuously fund our broader missions in **defense, health, and frontier R&D**. We embody a core philosophy of **excellence**: software and models engineered to *convert market chaos into ordered, measurable decisions* through **state-of-the-art ML/AI** and **deterministic, low-latency execution**.

### Mission

- **Monetize tiny, reliable edges** at scale via rigorous microstructure modeling and fast execution
- **Learn and improve continuously** with supervised training, continual learning, and reinforcement grounded in deterministic replay
- **Provide a financial backbone** for Syntropic—allocating profits to compute, data, research and adjacent mission areas
- **Expose one canonical window** into platform state—the **Nexus Observatory**—for live markets, model health, risk, logs, and forensics

### Vision

Build the world's best algorithmic trading platform that competes with leaders like XTX Markets. Trade worldwide, monetize tiny edges through an automated, intelligent core of models and deterministic execution. Develop ML techniques, trading algorithms, and market sentiment tools enabling price forecasts for 50,000+ financial instruments.

---

## Quick Start

### Prerequisites

- **C++20 toolchain:** clang 14+ or gcc 11+, CMake 3.20+
- **Python 3.11+** with `pip`
- **Node.js 20+** with `pnpm`
- **IB Gateway or TWS** (for Phase 1+)

### One-Command Setup

```bash
# Clone and setup
git clone <repo-url>
cd nexus
make setup
```

This will:
- Install pre-commit hooks
- Build C++ components
- Install Python and UI dependencies
- Create data directories
- Run all tests

### Start Development Environment

```bash
# Start all services (API + UI)
make dev

# Or manually:
# Terminal 1: python -m ops.observability_api.main
# Terminal 2: cd ui/observatory && pnpm dev
```

Visit **http://localhost:3000** to see the Observatory UI.

### Verify Installation

```bash
# Run all tests
make test

# Check API health
curl http://localhost:9400/health

# Expected: {"status":"healthy",...}
```

---

## Architecture

### System Components

```
[IB Gateway] ⇄ [FeedAdapter] → [EventLog (Parquet)] → [Replay/Simulator]
                                        ↓
                    [OrderBook L1/L2] → [Features] → [Strategy Engine]
                                        ↓
                    [OMS] → [Risk Gate] → [Execution]
                                        ↓
                    [Observability API] → [Observatory UI]
```

### Core Modules

| Module | Language | Purpose |
|--------|----------|---------|
| **Time** | C++ | Monotonic/wall-clock timestamps (ns precision) |
| **EventLog** | C++ | Append-only Parquet storage, deterministic replay |
| **OrderBook** | C++ | L1/L2 state with invariants (Phase 1) |
| **Features** | C++ | Deterministic transforms (OFI, microprice, etc.) |
| **Strategy** | Python | ML-driven decision engine |
| **OMS** | C++ | Order management with idempotent state machine |
| **Risk Gate** | C++ | Pre-trade checks, kill-switch, limits |
| **Observability API** | Python | Metrics, logs, events via FastAPI |
| **Observatory UI** | TypeScript | Next.js monitoring and control interface |

### Tech Stack

- **Core:** C++20, Python 3.11
- **Data:** Arrow/Parquet, DuckDB
- **ML/AI:** PyTorch/JAX (research), ONNX Runtime (inference)
- **API:** FastAPI, WebSocket/SSE
- **UI:** Next.js 14, React, Tailwind, Recharts
- **Build:** CMake, Poetry/uv, pnpm

---

## Guiding Principles

1. **Excellence as a Standard** - Clear assumptions, calibrated models, ablations, proofs of value
2. **Determinism > Cleverness** - Lossless recording and deterministic replay before shipping
3. **Separation of Concerns** - Alpha ≠ Execution ≠ Risk ≠ Data ≠ UI/Observability
4. **Swappable I/O** - Feeds, gateways, and data sources are adapters
5. **Metrics > Intuition** - Latency, mark-outs, realized spread measured every session
6. **Safety & Compliance by Default** - Limits, kill-switches, audit trails from day one
7. **Single Source of Truth UI** - All operational visibility flows through the **Observatory**

---

## Phase 0: Foundation COMPLETE

**Status:** All deliverables implemented, tested, and documented.

### What We Built

- **Monorepo infrastructure** with CI/CD, linters, quality gates
- **C++ core systems** (Time utilities, EventLog with schema)
- **Python configuration** system with Pydantic validation
- **Observability API** (FastAPI) with metrics, logs, events
- **Observatory UI** (Next.js) with health dashboard
- **Comprehensive documentation** and runbooks
- **Development tooling** (scripts, Makefile, pre-commit hooks)

### Project Structure

```
nexus/
├── cpp/                    # C++ core systems
│   ├── time/              # Time utilities (monotonic + wall-clock)
│   └── eventlog/          # EventLog (Parquet writer/reader)
├── py/nexus/              # Python modules
│   └── config.py          # Configuration management
├── ops/                   # Operations & observability
│   └── observability_api/ # FastAPI service
├── ui/observatory/        # Next.js monitoring UI
├── configs/               # Configuration files (base, paper, live)
├── docs/                  # Documentation
│   ├── VISION.md          # Full project vision and roadmap
│   ├── architecture.md    # System design
│   ├── phase0-summary.md  # Phase 0 deliverables
│   └── runbooks/          # Operational guides
├── scripts/               # Development tools
└── .github/workflows/     # CI/CD pipelines
```

### Exit Criteria Met

- CI green across C++/Python/UI
- EventLog write/read with deterministic replay contract
- Time utils pass property tests
- Observability API serves health/metrics/events
- UI displays health dashboard and connects to API
- IBKR headless setup documented
- Code coverage >70%

---

## Phase 1: Ingestion & L1 Book (Week 2-4)

**Next Objectives:**

1. **IBKR FeedAdapter** - Connect to IB Gateway, subscribe to market data
2. **L1 OrderBook** - C++ implementation with invariants
3. **Zero-loss capture** - Sustained ingestion (10-20 symbols)
4. **Live data in UI** - Real-time symbol tiles, spreads, trades
5. **Deterministic replay** - Full parity tests

### Prerequisites

```bash
# Install IBKR Gateway (see docs/runbooks/ibkr-setup.md)
# Test paper trading connection
# Review architecture (docs/architecture.md)
```

---

## EventLog Usage

### C++ Write Example

```cpp
#include "nexus/eventlog/writer.hpp"
#include "nexus/eventlog/partitioner.hpp"
#include "nexus/time.hpp"

// Use Partitioner for canonical paths
auto path = nexus::eventlog::Partitioner::get_path(
    "data/parquet", "AAPL", nexus::time::wall_ns());
nexus::eventlog::Writer writer(path);

nexus::eventlog::Trade trade;
trade.header.ts_event_ns = nexus::time::wall_ns();      // Wall-clock (exchange time)
trade.header.ts_receive_ns = nexus::time::wall_ns();    // Wall-clock (our receive time)
trade.header.ts_monotonic_ns = nexus::time::monotonic_ns();  // Monotonic (latency measurement)
trade.header.venue = "NASDAQ";
trade.header.symbol = "AAPL";
trade.header.source = "IBKR";
trade.header.seq = 1;
trade.price = 178.50;
trade.size = 100.0;
trade.aggressor = nexus::eventlog::Aggressor::BUY;

writer.append(trade);
writer.flush();
```

### C++ Read Example

```cpp
#include "nexus/eventlog/reader.hpp"

nexus::eventlog::Reader reader("data/parquet/AAPL/2025-01-09.parquet");

while (auto event = reader.next()) {
    std::visit([](auto&& e) {
        std::cout << "Symbol: " << e.header.symbol << std::endl;
    }, *event);
}
```

See [EventLog Usage Guide](docs/eventlog-usage.md) for complete documentation.

---

## Development

### Common Commands

```bash
make setup      # Initial setup (run once)
make build      # Build C++ components
make dev        # Start all services
make test       # Run all tests
make format     # Format all code
make lint       # Check code quality
make stop       # Stop all services
make clean      # Clean build artifacts
```

### Running Tests

```bash
# All tests
make test

# C++ only
cd build && ctest --output-on-failure

# Python only
pytest py/tests/ -v --cov

# UI only
cd ui/observatory && pnpm test
```

### Code Quality

```bash
# Format all code
make format

# Check formatting (CI mode)
make lint

# Pre-commit hooks (automatic)
pre-commit run --all-files
```

---

## Configuration

### Profiles

- **`configs/base.yaml`** - Base configuration
- **`configs/paper.yaml`** - Paper trading (port 7497)
- **`configs/live.yaml`** - Live trading (port 7496, conservative limits)

### Example Configuration

```yaml
environment: paper
symbols: [AAPL, MSFT, SPY]

ibkr:
  host: "127.0.0.1"
  port: 7497
  client_id: 42

storage:
  parquet_dir: "./data/parquet"
  log_dir: "./logs"

risk:
  max_notional: 100000
  max_position: 500
  price_band_bps: 50
  max_orders_per_sec: 10
  max_cancel_rate_bps: 3000

ui:
  observability_api: "http://localhost:9400"
  auth_provider: "oidc"
```

---

## Strategy Philosophy

### Guardrail Baseline

**Avellaneda–Stoikov** for safety rails and benchmarking (not the edge).

### Nexus-MM (Proprietary)

1. **Layer 1: Learned mark-out** → Quote-center shift from mid to predicted microprice
2. **Layer 2: Learned fill-hazard** → Choose bid/ask offsets maximizing expected utility
3. **Layer 3: Constrained RL** → Only if it beats Layer 2 under same risk & cancel budgets

### ML/AI Architecture

- **Data Ingestion:** IBKR → vendor/direct feeds; normalized to Arrow/Parquet
- **Alt-data & Sentiment:** Compliant APIs/web pipelines (robots.txt/TOS/legal)
- **Automated Model Core:**
  1. Ingest/normalize → append-only Parquet
  2. Replay → simulator (latency knobs, queue/kill, mark-outs)
  3. Train (offline): mark-out, fill-hazard, inventory/risk, sentiment
  4. Optimize policy: expected utility under risk/limits
  5. Shadow/A-B under guardrails
  6. TCA + drift → auto triage → refit proposals
  7. Governed promotion → deploy → back to (1)

---

## KPIs & SLOs

### Alpha & Execution

- **Mark-outs** @ 100ms / 1s / 5s (bps) > 0
- **Realized spread** (bps, net fees) > 0
- **Fill ratio** vs pick-off rate
- **Inventory drift** and hedge cost

### Latency (IBKR Phase)

| Stage | p50 Target | p99 Target |
|-------|------------|------------|
| Data → Book | < 2ms | < 10ms |
| Book → Features | < 1ms | < 5ms |
| Features → Decision | < 2ms | < 10ms |
| Decision → Submit | < 2ms | < 10ms |

**Hard Requirements:**
- Recorder loss = 0
- Replay parity = exact

### Data Ingestion

- **Freshness:** Median lag < target
- **Accuracy:** Dedupe < target, trust ≥ threshold
- **Compliance:** 100% (robots.txt/TOS/licensing)

### UI/Observability

- **Uptime:** ≥ 99.9%
- **Stream→Render:** p95 < 2s
- **Auditability:** All alerts/actions logged

---

## Risk, Compliance & Governance

### Pre-Trade Controls

- Price bands, notional/position caps
- Orders/sec & cancel-rate limits
- Duplicate-order guard

### Kill-Switch

- Manual + automated triggers
- Latency spikes, connectivity loss, repeated rejects

### Audit & Compliance

- Append-only decision logs
- Reproducible replay
- Post-trade TCA
- Provenance tracking (robots.txt/TOS adherence)
- Regulatory records (SEC/FINRA/CFTC/IIROC)

### Governance

- RFCs for breaking changes
- Gated model/data promotions
- **Observatory is authoritative** for ops actions

---

## Roadmap

### Phase 0 — Foundations (Week 0-2)
- Monorepo, CI, EventLog, Time utils, Config, API, UI skeleton

### Phase 1 — Ingestion & L1 Book (Week 2-4)
- IBKR adapter, L1 book, zero-loss capture, live UI data

### Phase 2 — Tick-by-Tick, L2 & Features (Week 4-6)
- Tick-by-tick + top-5 depth, feature kernels (OFI, microprice, etc.)

### Phase 3 — Simulator (Week 6-8)
- Discrete-event LOB sim, queue/kill models, mark-out calculator

### Phase 4 — Strategies + OMS & Risk (Week 8-10)
- Baselines (A-S, mean-rev/momo), OMS + Risk Gate

### Phase 5 — Paper Trading (Week 10-11)
- Paper integration, TCA dashboards, 5 stable days

### Phase 6 — Tiny Live (Week 12-13)
- Live at de-minimis size, positive realized spread

### Phase 7 — Hardening & Scale (Month 4-6)
- SIMD, lock-free queues, symbol expansion

### Phase 8 — Low-Latency Track (Parallel R&D)
- Vendor/direct feeds, proximity/colo dossier

### Phase 9 — Global Multi-Asset & Sentiment Scale-Up
- FX, futures, options via DMA; alt-data expansion

See [docs/VISION.md](docs/VISION.md) for complete roadmap.

---

## Documentation

### Quick Reference
- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Detailed setup guide
- **[PHASE0_COMPLETE.md](PHASE0_COMPLETE.md)** - Phase 0 completion certificate

### Architecture & Design
- **[docs/VISION.md](docs/VISION.md)** - Full project vision and roadmap
- **[docs/architecture.md](docs/architecture.md)** - System design and data flow
- **[context.md](context.md)** - System architecture for AI/developers

### Operations
- **[docs/runbooks/ibkr-setup.md](docs/runbooks/ibkr-setup.md)** - IBKR Gateway setup
- **[docs/phase0-summary.md](docs/phase0-summary.md)** - Phase 0 deliverables

---

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and ensure tests pass
3. Run pre-commit: `pre-commit run --all-files`
4. Submit PR with clear description

### Code Owners

- Core systems (C++): `cpp/time/`, `cpp/eventlog/`, `cpp/book/`, `cpp/oms/`, `cpp/risk/`
- Strategy & ML: `py/nexus/strategy/`, `py/nexus/ml/`
- Operations: `ops/`
- UI: `ui/`
- Docs & RFCs: `docs/rfcs/`

---

## Positioning vs. XTX

Leaders like XTX operate **industrial-scale data ingestion** (including alt-data), **frontier ML forecasting**, and **tight data→decision→order loops**—monetizing small edges across breadth and volume.

**Nexus (Syntropic's twist):**

- **Excellence + Self-Reinforcement:** Profits fund compute & data; upgrades improve models; models improve P&L
- **Software-first automation:** Engineered pipelines for training, eval, and deployment—**not** "no-code"
- **World-class ingestion:** Build the **most accurate, compliant, and timely sentiment & alt-data stack** possible
- **Single pane of glass:** The **Nexus Observatory** is the *only* visualization and control surface

---

## Security & Operations

### Authentication & Authorization
- **AuthN:** OIDC, short-lived tokens (Phase 5+)
- **RBAC:** Ops/Research/ReadOnly roles
- **Secrets:** Env/secret manager; paper vs live isolation

### Resilience
- Bounded queues, back-pressure
- Idempotent OMS, graceful shutdowns
- Automatic reconnects

### Runbooks
- Disconnect/reconnect, degraded data
- Gateway restart, ingestion failures
- Incident templates—all executed via **Observatory**

---

## License & Disclaimer

© Syntropic. All rights reserved.

For research and proprietary trading use inside Syntropic. This repository does **not** constitute investment advice. Users are responsible for compliance with broker/exchange rules, data licenses, robots.txt/TOS, and applicable regulations. Trading involves risk; no performance is guaranteed.

---

## Getting Help

### Documentation
- Quick start: This README
- Detailed guide: [GETTING_STARTED.md](GETTING_STARTED.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Full vision: [docs/VISION.md](docs/VISION.md)

### Troubleshooting
1. Check logs: `tail -f logs/*.log`
2. Verify API: `curl http://localhost:9400/health`
3. Review CI: `.github/workflows/ci.yml`

### Support
- Internal: `#nexus-support` channel
- Issues: GitHub Issues (if applicable)

---

## Syntropic Statement

**Nexus** operationalizes Syntropic's thesis: **excellence creates structure that beats noise**.

We push the boundaries of pure mathematics blended with modern ML/AI, build the **most accurate, compliant market-sentiment and alternative-data ingestion stack** we can, and expose the entire system through a single, disciplined lens—the **Nexus Observatory**—to deliver **decisive, safe, and scalable** trading at global scale.

---

**Phase 0:** **COMPLETE** - Foundation solid, ready for Phase 1  
**Next:** IBKR FeedAdapter + L1 OrderBook  
**Mission:** Build the world's best algorithmic trading platform

*Excellence is our standard. Let's build an empire.*
