# Nexus

**Nexus** is Syntropic’s flagship, research-grade algorithmic trading platform —an engine designed to **bootstrap the company’s financial independence** and continuously fund Syntropic’s broader missions in **defense, health, and frontier R&D**. Nexus embodies our core philosophy of **excellence**: software and models engineered to *convert market chaos into ordered, measurable decisions* through **state-of-the-art ML/AI** and **deterministic, low-latency execution**. Nexus will remove all sentimental and human weaknesses from the trading loops. Building a 100% algorithmic-backed program that uses mathematical excellence, ai/ml models and logic for daily trades.

Nexus is built in **phases**. We start on IBKR (US equities), master lossless data, reproducible research, and safe execution; then graduate to **DMA/direct feeds**, **proximity/co-location**, **global multi-asset routing**, and **world-class, compliant data ingestion** (including web/alt-data pipelines) as measured edge and latency requirements justify. The end state is a **self-reinforcing financial engine**: trading profits → compute & data upgrades → smarter models → better trades → more profits—powering Syntropic’s long-term vision.

> **Important framing:** Syntropic is a **software-first** company—not “no-code.” Nexus is a deeply engineered platform whose **automated, intelligent model core** learns and improves through **high-quality datasets**, **careful supervision**, and **reinforcement**—under strict governance, risk, and compliance controls.

---

## Table of Contents

* [Executive Summary](#executive-summary)
* [Vision & Role Inside Syntropic](#vision--role-inside-syntropic)
* [Positioning vs. XTX](#positioning-vs-xtx)
* [Guiding Principles](#guiding-principles)
* [Scope (Phase-1) and Non-Goals](#scope-phase1-and-non-goals)
* [System Architecture](#system-architecture)
* [ML/AI Architecture, Data Ingestion & Learning Loop](#mlai-architecture-data-ingestion--learning-loop)
* [Strategy Philosophy](#strategy-philosophy)
* [Roadmap & Phases](#roadmap--phases)  ← **includes the Nexus UI (“Observatory”)**
* [KPIs & SLOs](#kpis--slos)
* [Risk, Compliance & Governance](#risk-compliance--governance)
* [Security & Operations](#security--operations)
* [Tech Stack](#tech-stack)
* [Getting Started](#getting-started)
* [Development Workflow](#development-workflow)
* [Testing & Quality Gates](#testing--quality-gates)
* [Observability](#observability)
* [Glossary](#glossary)
* [License & Disclaimer](#license--disclaimer)

---

## Executive Summary

Nexus is a **self-evolving algorithmic trading platform** engineered to:

* Monetize **tiny, reliable edges** at scale via rigorous microstructure modeling and fast execution.
* **Learn and improve continuously** with supervised training, continual learning, and reinforcement grounded in deterministic replay and simulation.
* Provide a **financial backbone** for Syntropic—allocating profits to compute, data, and adjacent mission areas.
* **Expose one canonical window** into platform state—the **Nexus UI (“Observatory”)**—for live markets, model health, risk, logs, and forensics.

---

## Vision & Role Inside Syntropic

* **Corporate Goal:** Make Syntropic the first enterprise to **fund its own expansion** via an AI-powered trading engine, reinvesting into defense, health, and frontier initiatives.
* **Philosophy:** Systems that **produce order**—Nexus turns raw markets into precise, auditable decisions while steadily raising the bar of **excellence** in engineering and research.
* **Operating Model:** A **software-first**, model-centric platform with an **automated, intelligent core** that adapts via supervised learning, continual learning, and reinforcement—under strict governance and safety controls.

---

## Positioning vs. XTX

Leaders like XTX (public signals) operate **industrial-scale data ingestion** (including alt-data), **frontier ML forecasting**, and **tight data→decision→order loops**—monetizing small edges across breadth and volume.

**Nexus (Syntropic’s twist):**

* **Excellence + Self-Reinforcement:** profits fund compute & data; upgrades improve models; models improve P&L.
* **Software-first automation:** engineered pipelines for training, eval, and deployment—**not** “no-code.”
* **World-class ingestion:** build the **most accurate, compliant, and timely sentiment & alt-data stack** possible; treat data quality as a first-class competitive asset.
* **Single pane of glass:** the **Nexus Observatory** is the *only* visualization and control surface during development and operations.

---

## Guiding Principles

1. **Excellence as a Standard.** Clear assumptions, calibrated models, ablations, proofs of value.
2. **Determinism > Cleverness.** Lossless recording and deterministic replay before shipping.
3. **Separation of Concerns.** **Alpha ≠ Execution ≠ Risk ≠ Data Ingestion ≠ UI/Observability**.
4. **Swapable I/O.** Feeds, gateways, and data sources are adapters; strategies never depend on any single vendor.
5. **Metrics > Intuition.** Latency, mark-outs, realized spread, inventory risk, data freshness/quality—measured every session.
6. **Safety & Compliance by Default.** Limits, kill-switches, audit trails, and legal/robots.txt/TOS compliance from “Hello World.”
7. **Single Source of Truth UI.** All operational visibility flows through the **Nexus Observatory** UI—no shadow dashboards.

---

## Scope (Phase-1) and Non-Goals

**Phase-1 Scope**

* Venue: **IBKR TWS/IB Gateway** (paper + live), **US equities**
* Horizons: **10 ms → minutes**
* Deliverables: lossless ingestion → deterministic replay → L1/L2 books → simulator → baselines → OMS/risk → paper → **tiny live**
* ML: compact live models; heavier research offline; nightly refits and drift checks
* Data: broker feeds first; **early sentiment/alt-data** via compliant APIs (expand later)
* UI: **Nexus Observatory** MVP (read-only at first), then interactive for forensics and safe controls

**Non-Goals (early)**

* Production co-lo/direct feeds (R&D only until metrics demand)
* Heavy infra (Kafka/k8s) without proven need
* Exotic deep models in live path before baselines win
* “Scrape-everything” without legal/compliance review
* Out-of-band dashboards (Grafana/etc.)—**Observatory is the only visualization**

---

## System Architecture

```
[TWS / IB Gateway] <-> [FeedAdapter::IBKR] --> [EventLog (Parquet, append-only)]
                                              \
                                               [Replay] --> [Simulator (discrete-event LOB)]
                                              \
[OrderBook (L1/L2, C++)] --> [Features (C++)] --> [Strategy Engine (Python)] --> [OMS (C++)] --> [OmsAdapter::IBKR]
                                                   \                         \
                                                  [Risk Gate (C++)]           [TCA / Metrics / Alerts]
                                                                          \
                                                                  [Observability API]
                                                                          \
                                                          [Nexus UI ("Observatory")]
```

**Observability Data Plane**

* **Metrics:** Prometheus/OpenMetrics → Observability API → UI
* **Logs/Traces:** structured JSON (ClickHouse/Loki-like) → Observability API → UI
* **Events:** WebSocket/SSE from Observability API → UI (live state, LOB thumbnails, order events)

---

## ML/AI Architecture, Data Ingestion & Learning Loop

**Data Ingestion (market + alternative)**

* Market: IBKR → later vendor/direct feeds; normalized to Arrow/Parquet with provenance.
* Alt-data & sentiment: compliant APIs / web pipelines (robots.txt/TOS/legal), with accuracy (dedupe, trust scoring), freshness (bounded lag), provenance (source IDs), and rights management.

**Automated, Intelligent Model Core**

1. Ingest/normalize → append-only Parquet
2. Replay → simulator (latency knobs, queue/kill, mark-outs)
3. Train (offline): short-horizon mark-out, fill-hazard, inventory/risk, sentiment factors
4. Optimize policy: expected utility under risk/limits
5. Shadow/A-B under guardrails (bands, caps, cancel-rate, kill-switch)
6. TCA + drift → auto triage → refit proposals
7. Governed promotion → deploy → back to (1)

---

## Strategy Philosophy

* **Guardrail Baseline:** Avellaneda–Stoikov for safety rails and benchmarking (not the edge).
* **Nexus-MM (proprietary):**

  * Layer-1: learned **mark-out** → quote-center shift from mid to predicted microprice.
  * Layer-2: learned **fill-hazard** → choose bid/ask offsets maximizing expected utility.
  * Layer-3: constrained RL (only if it *beats* Layer-2 under same risk & cancel budgets).

---

## Roadmap & Phases

> **UI note:** The **Nexus UI (“Observatory”)** is the *only* visualization & operational console. Each phase below includes explicit UI milestones.

### Phase 0 — Foundations (Week 0–2)

* Monorepo, CI, code style gates; EventLog (Parquet); time utils (monotonic + wall).
* IB Gateway configured (headless); paper vs live profiles.
* **UI:** Observatory design doc (IA, components, security posture), wireframes, UI scaffolding (Next.js/React + Tailwind).
  **Exit:** CI green; unit coverage ≥70% for `/ingest` & `/book`; UI skeleton builds & auth stub works.

### Phase 1 — Ingestion & L1 Book (Week 2–4)

* C++ IBKR adapter for quotes/trades; sustained capture (10–20 symbols) without loss.
* C++ L1 book + invariants + pybind11.
* **UI (MVP-1 / Read-only):**

  * Live system health & latency SLOs (Data→Book, Book→Features, Features→Decision, Decision→Submit).
  * Per-symbol tiles: L1 snapshot, spread, recent trades, basic mark-outs.
  * Log tail (structured JSON) with filter/search.
    **Exit:** zero-loss capture; deterministic L1 replay parity; UI shows live health & symbol tiles.

### Phase 2 — Tick-by-Tick, L2 & Features (Week 4–6)

* Tick-by-tick + top-5 depth for a small watchlist.
* Feature kernels: microprice, OFI/imbalance, depth slope, burst metrics.
* **UI (MVP-2):**

  * Mini LOB visualizer (top-k), imbalance gauges, microprice vs mid chart.
  * Per-module latency histograms and error rates.
    **Exit:** no crossed book; snapshot ≡ delta; UI renders L2/feature widgets in real-time.

### Phase 3 — Simulator (Week 6–8)

* Discrete-event LOB sim; queue/kill models; mark-out calculator.
* **UI (Forensics):**

  * Replay viewer: select time range & symbol → step/play events; overlay fills & P&L.
  * Incident timeline: correlated events/logs/metrics for a window.
    **Exit:** full-day replay < 30 min; sim tracks live captures within tolerance; UI replay tooling operational.

### Phase 4 — Strategies + OMS & Risk (Week 8–10)

* Baselines (A–S, mean-rev/momo); C++ OMS + Risk (bands, caps, cancel-rate, kill-switch).
* **UI (Trading console read-only):**

  * Order state machine views, per-order lifecycle, reject analysis.
  * Risk posture: position/notional utilization, price-band violations, cancel-rate.
    **Exit:** restart safety; no ghost orders; deterministic backtests; UI shows OMS/risk state live.

### Phase 5 — Paper Trading (Week 10–11)

* Paper integration; symbol scheduler honoring IBKR pacing; TCA dashboards (mark-outs, realized spread, decision→ack).
* **UI (Operational workflows):**

  * Daily TCA report generation & comparison.
  * Config diff viewer (read-only), feature drift monitors, model version badges.
    **Exit:** 5 stable paper days; positive avg 1 s mark-out; UI is the sole operational window.

### Phase 6 — Tiny Live (Week 12–13)

* Live at de-minimis size; SMART baseline, then directed venue A/B.
* **UI (Live controls - guarded):**

  * Kill-switch button w/ multi-party confirm; pause/resume symbol groups.
  * Alert center: SLO breaches, rejects, connectivity events, ingestion anomalies.
    **Exit:** positive realized spread (net fees) over 20 sessions; mid-session restart drill; UI used for all ops responses.

### Phase 7 — Hardening & Scale (Month 4–6)

* SIMD hot loops, lock-free queues, NUMA pinning; optional Rust risk-gate; symbol expansion.
* **UI (Scale & access):**

  * Multi-venue views, global symbol search, RBAC (Ops/Research/ReadOnly).
  * Saved investigations and sharable forensics links.
    **Exit:** p99 variance reduced 30–50%; replay regression suite green; one-click strategy rollback; UI handles fleet-scale views.

### Phase 8 — Low-Latency Track (Parallel R&D)

* Finalize adapters; prototype vendor/direct feed parser; mock FIX/native gateway; proximity/colo dossier.
* **UI:** venue/adapter health boards, per-adapter latency & packet loss, cutover drills.
  **Exit:** synthetic line-rate loop with headroom; docs to cut one venue < 2 weeks; UI supports adapter cutover rituals.

### Phase 9 — Global Multi-Asset & Sentiment Scale-Up

* FX, futures, options via DMA; region expansion; bilateral/single-dealer streams (later).
* Alt-data expansion: scale compliant web/sentiment ingestion (accuracy, freshness, provenance).
* **UI:** cross-asset dashboards, factor/signal explainers, sentiment surprise heatmaps, regional clocks.
  **Exit:** breadth × turnover with stable risk; unified feature registry; UI remains the **only** visualization/control surface.

---

## KPIs & SLOs

**Alpha & Execution:** mark-outs @ {100 ms, 1 s, 5 s} (bps) > 0; realized spread (net fees) > 0; fill ratio vs pick-off; inventory drift; hedge cost.
**Systems (IBKR targets):** Data→Book p50<2 ms/p99<10 ms; Book→Features p50<1 ms/p99<5 ms; Features→Decision p50<2 ms/p99<10 ms; Decision→Submit p50<2 ms/p99<10 ms; recorder loss=0; replay parity=exact.
**Data Ingestion:** freshness (median lag < target), accuracy (dedupe < target, trust ≥ threshold), compliance 100%.
**UI/Observability:** UI uptime ≥ 99.9%; end-to-end telemetry lag p95 < 2 s; auditability of every alert/action.

> We do **not** publish fixed “daily return” targets. We optimize **Sharpe**, **drawdown**, and **capacity-adjusted** P&L.

---

## Risk, Compliance & Governance

* **Pre-trade:** price bands, notional/position caps, orders/sec & cancel-rate limits, duplicate-order guard.
* **Kill-switch:** manual + automated triggers (latency spikes, connectivity loss, repeated rejects).
* **Audit:** append-only decision logs; reproducible replay; post-trade TCA.
* **Licensing & Web Compliance:** provenance tracking; robots.txt/TOS adherence; rights management.
* **Regulatory:** records for SEC/FINRA/CFTC/IIROC (as applicable); anti-manipulation controls.
* **Governance:** RFCs for breaking changes; gated model/data promotions; **UI is authoritative** for ops actions.

---

## Security & Operations

* **AuthN/Z:** OIDC, short-lived tokens, RBAC (Ops/Research/ReadOnly).
* **Secrets:** env/secret manager; paper vs live isolation; least-privilege network policies.
* **Resilience:** bounded queues, back-pressure, idempotent OMS, graceful shutdowns, automatic reconnects.
* **Runbooks:** disconnect/reconnect, degraded data, gateway restart, ingestion failures, incident templates—all executed via the **UI**.

---

## Tech Stack

* **Core:** C++20 (systems, pybind11 bridges), Python 3.11 (ML/AI, sim, orchestration).
* **Storage/Data:** Arrow/Parquet, DuckDB (local analytics), ClickHouse (later).
* **ML/AI:** PyTorch/JAX (research), ONNX Runtime/LibTorch (inference).
* **Ingestion:** HTTP/WS clients, entity linking/NLP pipelines; compliant web/alt-data with provenance.
* **Observability API:** FastAPI/Go/Gateway exposing metrics/logs/events to the UI (WebSocket/SSE).
* **UI (“Observatory”):** Next.js/React, Tailwind, WebSocket/SSE live streams, server-side auth, ECharts/Recharts for time-series, Map/heatmap components for global venues.
* **Build/Tooling:** CMake, clang/gcc, Poetry/uv, clang-format, Black, pre-commit.

---

## Getting Started

### Prereqs

* Linux/macOS, C++20 toolchain (clang/gcc), CMake
* Python 3.11 (`uv` or Poetry)
* IB Gateway or TWS installed; API enabled (paper first)

### Build core libs

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

### Python env

```bash
uv venv && uv pip install -r requirements.txt
# or: poetry install
```

### Configure (`config.yaml`)

```yaml
ibkr:
  host: "127.0.0.1"
  port: 7497
  client_id: 42
symbols: ["AAPL","MSFT","SPY"]
storage:
  parquet_dir: "./data/parquet"
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

### Record data

```bash
./build/ingest/ibkr_recorder --config config.yaml
```

### Replay & simulate

```bash
python -m sim.run --parquet ./data/parquet --latency-config ./configs/latency.yaml
```

### Paper trade

```bash
python -m strategy.run --config config.yaml --paper
```

### Launch the UI

```bash
# Observability API
python -m ops.observability_api --config config.yaml
# Observatory (Next.js)
pnpm install && pnpm dev
```

---

## Development Workflow

* **Branching:** feature branches → PRs; code owners for `/book`, `/oms`, `/risk`, `/ingest`, `/ops`, `/ui`.
* **Reviews:** systems (perf/safety), ML/data (features, leakage, compliance), and **UI/ops ergonomics**.
* **Docs:** update `/docs/` & changelog for any interface change.
* **Versioning:** semantic versioning for public interfaces; RFCs for breaking changes.

---

## Testing & Quality Gates

* **Unit:** GTest (C++), pytest (Python), Jest/Playwright (UI).
* **Property:** order-book invariants; feature monotonicities.
* **Replay:** snapshot == delta; idempotent OMS on restart; no ghost orders.
* **Performance:** latency histograms per stage in CI.
* **Ingestion QA:** freshness, accuracy, dedupe, provenance; robots.txt/TOS tests.
* **UI:** contract tests for Observability API; latency budget p95 < 2 s stream-to-render.
* **Acceptance:** phase exit criteria (see Roadmap).

**CI hard stops:** crossed book, negative depth, recorder loss, broken replay parity, orphaned orders, risk breach, ingestion non-compliance, UI/Observability SLA breach.

---

## Observability

* **Metrics:** Prometheus/OpenMetrics exposed via Observability API; rendered exclusively in the **Observatory**.
* **Logs:** structured JSON with correlation IDs; searchable in UI (ClickHouse backend or equivalent).
* **Events:** WebSocket/SSE live streams for state changes, LOB snapshots, order events.
* **Dashboards:** latency SLOs, risk utilization, per-symbol execution quality, model & data drift, incident timelines—**all inside the Observatory**.

---

## Glossary

* **Nexus Observatory:** the **only** UI for platform/market visibility, forensics, and guarded controls.
* **Automated, intelligent model core:** supervised/continual/RL system improving under strict safety and compliance.
* **Mark-out / Realized spread / OFI / Replay parity:** see internal wiki for formal definitions.

---

## License & Disclaimer

© Syntropic. All rights reserved.
For research and proprietary trading use inside Syntropic. This repository does **not** constitute investment advice. Users are responsible for compliance with broker/exchange rules, data licenses, robots.txt/TOS, and applicable regulations. Trading involves risk; no performance is guaranteed.

---

### Syntropic Statement

**Nexus** operationalizes Syntropic’s thesis: **excellence creates structure that beats noise**.
We will push the boundaries of pure mathematics blended with modern ML/AI, build the **most accurate, compliant market-sentiment and alternative-data ingestion stack** we can, and expose the entire system through a single, disciplined lens—the **Nexus Observatory**—to deliver **decisive, safe, and scalable** trading at global scale.
