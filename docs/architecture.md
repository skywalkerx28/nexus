# Nexus Architecture - Phase 0

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nexus Platform                          │
│                         Phase 0: Foundation                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Observatory    │◄────►│  Observability   │◄────►│   Core Systems   │
│   (Next.js UI)   │ HTTP │      API         │ C++  │   (C++/Python)   │
│                  │ WS   │   (FastAPI)      │ Bind │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
        │                          │                          │
        │                          │                          │
        ▼                          ▼                          ▼
   localhost:3000           localhost:9400              EventLog/Time
```

## Component Architecture

### 1. Core Systems (C++)

**Time Module** (`cpp/time/`)
```
┌─────────────────────────────────────┐
│         Time Utilities              │
├─────────────────────────────────────┤
│ • monotonic_ns()                    │
│ • wall_ns()                         │
│ • to_iso8601() / from_iso8601()     │
│ • Validation functions              │
└─────────────────────────────────────┘
```

**EventLog Module** (`cpp/eventlog/`)
```
┌─────────────────────────────────────┐
│          EventLog                   │
├─────────────────────────────────────┤
│ Schema:                             │
│  • EventHeader (common fields)      │
│  • DepthUpdate                      │
│  • Trade                            │
│  • OrderEvent                       │
│  • Bar                              │
│  • Heartbeat                        │
├─────────────────────────────────────┤
│ Writer:                             │
│  • append(event)                    │
│  • flush()                          │
│  • close()                          │
├─────────────────────────────────────┤
│ Reader:                             │
│  • next() → Event                   │
│  • reset()                          │
│  • event_count()                    │
└─────────────────────────────────────┘
```

### 2. Configuration System (Python)

```
┌─────────────────────────────────────┐
│      NexusConfig (Pydantic)         │
├─────────────────────────────────────┤
│ • environment: PAPER | LIVE         │
│ • symbols: List[str]                │
│ • ibkr: IBKRConfig                  │
│ • storage: StorageConfig            │
│ • risk: RiskConfig                  │
│ • ui: UIConfig                      │
├─────────────────────────────────────┤
│ Methods:                            │
│  • from_yaml(path)                  │
│  • to_yaml(path)                    │
│  • Validation & type safety         │
└─────────────────────────────────────┘
```

### 3. Observability API (FastAPI)

```
┌─────────────────────────────────────┐
│      Observability API              │
├─────────────────────────────────────┤
│ REST Endpoints:                     │
│  GET  /health                       │
│  GET  /metrics (Prometheus)         │
│  POST /logs/search                  │
│  GET  /status                       │
├─────────────────────────────────────┤
│ WebSocket:                          │
│  WS   /events (real-time)           │
├─────────────────────────────────────┤
│ Features:                           │
│  • Structured logging (structlog)   │
│  • Prometheus metrics               │
│  • Connection manager               │
│  • CORS middleware                  │
│  • Heartbeat task                   │
└─────────────────────────────────────┘
```

### 4. Observatory UI (Next.js)

```
┌─────────────────────────────────────┐
│        Observatory UI               │
├─────────────────────────────────────┤
│ Components:                         │
│  • HealthStatus                     │
│  • LatencyMetrics                   │
│  • SymbolTiles                      │
│  • LogTail                          │
├─────────────────────────────────────┤
│ Features:                           │
│  • Real-time API connectivity       │
│  • Dark theme (Nexus colors)        │
│  • Responsive layout                │
│  • WebSocket client                 │
├─────────────────────────────────────┤
│ Tech Stack:                         │
│  • Next.js 14 (App Router)          │
│  • TypeScript (strict)              │
│  • Tailwind CSS                     │
│  • Recharts                         │
└─────────────────────────────────────┘
```

## Data Flow (Phase 0)

```
┌──────────┐
│   User   │
└────┬─────┘
     │ HTTP GET /
     ▼
┌──────────────────┐
│  Observatory UI  │
│  (Next.js)       │
└────┬─────────────┘
     │ HTTP GET /health
     │ WS /events
     ▼
┌──────────────────┐
│ Observability API│
│  (FastAPI)       │
└────┬─────────────┘
     │ (Future: Query EventLog)
     ▼
┌──────────────────┐
│   EventLog       │
│   (C++)          │
└──────────────────┘
```

## Data Flow (Phase 1+)

```
┌──────────────┐
│  IB Gateway  │
└──────┬───────┘
       │ Market Data
       ▼
┌──────────────┐
│ FeedAdapter  │
│   (C++)      │
└──────┬───────┘
       │ Normalized Events
       ▼
┌──────────────┐
│  EventLog    │
│  (Parquet)   │
└──────┬───────┘
       │
       ├──────────────────────┐
       │                      │
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│  OrderBook   │      │   Replay     │
│   (L1/L2)    │      │  (Simulator) │
└──────┬───────┘      └──────────────┘
       │
       ▼
┌──────────────┐
│  Features    │
│   (C++)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Strategy    │
│  (Python)    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│     OMS      │
│   (C++)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Risk Gate   │
│   (C++)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ OmsAdapter   │
│   (IBKR)     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  IB Gateway  │
└──────────────┘
```

## Directory Structure

```
nexus/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
├── cpp/
│   ├── time/                   # Time utilities
│   │   ├── include/nexus/
│   │   │   └── time.hpp
│   │   ├── src/
│   │   │   └── time.cpp
│   │   └── test/
│   │       └── time_test.cpp
│   └── eventlog/               # EventLog system
│       ├── include/nexus/eventlog/
│       │   ├── schema.hpp
│       │   ├── writer.hpp
│       │   └── reader.hpp
│       ├── src/
│       │   ├── schema.cpp
│       │   ├── writer.cpp
│       │   ├── reader.cpp
│       │   └── bindings.cpp    # pybind11
│       └── test/
│           └── eventlog_test.cpp
├── py/
│   ├── nexus/
│   │   ├── __init__.py
│   │   └── config.py           # Configuration system
│   └── tests/
│       └── test_config.py
├── ops/
│   ├── observability_api/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI app
│   │   └── requirements.txt
│   └── tests/
│       └── test_api.py
├── ui/
│   └── observatory/
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx    # Main page
│       │   │   ├── layout.tsx
│       │   │   └── globals.css
│       │   └── components/
│       │       ├── HealthStatus.tsx
│       │       ├── LatencyMetrics.tsx
│       │       ├── SymbolTiles.tsx
│       │       └── LogTail.tsx
│       ├── package.json
│       ├── tsconfig.json
│       └── tailwind.config.js
├── configs/
│   ├── base.yaml               # Base config
│   ├── paper.yaml              # Paper trading
│   └── live.yaml               # Live trading
├── docs/
│   ├── architecture.md         # This file
│   ├── phase0-summary.md       # Phase 0 summary
│   └── runbooks/
│       └── ibkr-setup.md       # IBKR setup guide
├── scripts/
│   ├── setup.sh                # Initial setup
│   ├── dev.sh                  # Start dev env
│   ├── stop.sh                 # Stop services
│   └── test.sh                 # Run all tests
├── CMakeLists.txt              # C++ build config
├── pyproject.toml              # Python config
├── Makefile                    # Dev commands
├── README.md                   # Quick start
├── GETTING_STARTED.md          # Detailed guide
├── readme                      # Full vision (original)
└── context.md                  # AI context
```

## Technology Stack

### Core Systems
- **Language:** C++20
- **Build:** CMake 3.20+
- **Testing:** Google Test
- **Bindings:** pybind11
- **Serialization:** Arrow/Parquet (Phase 1)

### Python
- **Version:** 3.11+
- **Config:** Pydantic 2.5+
- **Testing:** pytest, hypothesis
- **Linting:** ruff, black, mypy

### Observability API
- **Framework:** FastAPI 0.109+
- **Server:** Uvicorn
- **Logging:** structlog
- **Metrics:** prometheus-client
- **WebSocket:** native FastAPI

### UI
- **Framework:** Next.js 14
- **Language:** TypeScript 5.3
- **Styling:** Tailwind CSS 3.4
- **Charts:** Recharts 2.10
- **Build:** pnpm

### DevOps
- **CI/CD:** GitHub Actions
- **Linting:** pre-commit hooks
- **Format:** clang-format, Black, prettier

## Security Architecture

```
┌─────────────────────────────────────┐
│         Security Layers             │
├─────────────────────────────────────┤
│ 1. Network                          │
│    • Localhost only (Phase 0)       │
│    • CORS whitelist                 │
│    • No public exposure             │
├─────────────────────────────────────┤
│ 2. Authentication (Future)          │
│    • OIDC provider                  │
│    • Short-lived tokens             │
│    • RBAC (Ops/Research/ReadOnly)   │
├─────────────────────────────────────┤
│ 3. Secrets                          │
│    • Environment variables          │
│    • Secret manager (production)    │
│    • No credentials in git          │
├─────────────────────────────────────┤
│ 4. Data                             │
│    • Append-only EventLog           │
│    • Audit trails                   │
│    • Provenance tracking            │
└─────────────────────────────────────┘
```

## Performance Targets (Phase 1+)

### Latency SLOs (IBKR Phase)
```
Data → Book:        p50 < 2ms,  p99 < 10ms
Book → Features:    p50 < 1ms,  p99 < 5ms
Features → Decision: p50 < 2ms,  p99 < 10ms
Decision → Submit:  p50 < 2ms,  p99 < 10ms
```

### Throughput
- Events/sec: 10,000+ (per symbol)
- Symbols: 10-20 (Phase 1), 100+ (Phase 7)
- Recorder loss: 0 (hard requirement)

### Reliability
- UI uptime: ≥ 99.9%
- API uptime: ≥ 99.9%
- Replay parity: 100% (exact)

## Observability

### Metrics (Prometheus)
- Request counters (by endpoint)
- Active WebSocket connections
- Latency histograms (future)
- Event throughput (future)

### Logs (Structured JSON)
- Timestamp (ISO 8601)
- Level (DEBUG/INFO/WARN/ERROR)
- Message
- Module/component
- Correlation ID
- Metadata

### Events (WebSocket)
- System health
- Market data updates (future)
- Order events (future)
- Alerts and anomalies (future)

## Deployment Model

### Phase 0 (Current)
```
Developer Laptop
├── C++ binaries (local build)
├── Python venv
├── Node.js dev server
└── Localhost networking
```

### Phase 1-6
```
Single Server
├── C++ processes (pinned cores)
├── Python orchestrator
├── UI (Next.js production build)
└── IBKR Gateway (headless)
```

### Phase 7+ (Future)
```
Multi-Server Fleet
├── Trading servers (proximity/colo)
├── Research cluster (GPU)
├── Data ingestion pipeline
└── UI/API (cloud)
```

## Testing Strategy

### Unit Tests
- C++: Google Test
- Python: pytest
- UI: Jest

### Integration Tests
- API contracts (OpenAPI)
- WebSocket connections
- End-to-end flows

### Property Tests
- Time invariants
- EventLog parity
- OrderBook invariants (Phase 1)

### Performance Tests
- Latency benchmarks
- Throughput stress tests
- Memory profiling

## Phase 0 Limitations

1. **EventLog:** Placeholder binary format (Arrow/Parquet in Phase 1)
2. **UI Data:** Mock data (live data in Phase 1)
3. **Authentication:** Stub only (OIDC in Phase 5+)
4. **Metrics:** Basic counters (full histograms in Phase 1)
5. **Logs:** In-memory only (ClickHouse in Phase 3+)

## Next Phase Preview

### Phase 1: Ingestion & L1 Book
- IBKR FeedAdapter (C++)
- L1 OrderBook with invariants
- Zero-loss capture (10-20 symbols)
- Live data in UI
- Deterministic replay with parity tests

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-09  
**Phase:** 0 (Foundation)  
**Status:** Complete

