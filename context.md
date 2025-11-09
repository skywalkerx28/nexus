# Nexus — Context for AI Coding Models
# Purpose: Provide enough context so code-generation models understand Nexus goals, boundaries, and interfaces.
# Tone: Software-first, excellence-driven, safety-obsessed, scalable.

============================================================
MISSION & NORTH STAR
============================================================
Nexus is Syntropic’s flagship, research-grade algorithmic trading platform.
Goal: Build the world's best algorithmic trading platform that competes with xtx markets. Trade worldwide, monetize tiny, reliable edges at scale through an automated, intelligent core of models and a deterministic, low-latency execution stack. Develop machine learning techniques, trading algorithms and market sentiment tools that will enable nexus to produce price forecasts for over 50,000 financial instruments.
Profits fund Syntropic’s broader missions (defense, health, frontier R&D).

Excellence standard:
- Software-first engineering.
- Deterministic systems and replayability over ad-hoc cleverness.
- Clear metrics (mark-outs, realized spread, latency SLOs).
- Single source of truth UI: the Nexus Observatory.

Initial scope (Phase-1):
- Venue: IBKR TWS/IB Gateway (paper + live), US equities.
- Horizons: ~10 ms → minutes (microstructure-driven).
- Deliverables: lossless ingestion → deterministic replay → L1/L2 books → simulator → baselines → OMS/risk → paper → tiny live.
- Data: broker feeds first; early compliant sentiment/alt-data via APIs (expand later).
- UI: Nexus Observatory is the ONLY visualization & ops console.

Non-goals (early):
- Production colo/direct exchange feeds (R&D only until metrics justify).
- Heavy infra (Kafka/K8s) unless needed.
- Exotic deep models in the live path before baselines win.
- Any scraping or data ingestion that violates robots.txt/TOS/licensing.

============================================================
SYSTEM ARCHITECTURE (MENTAL MODEL)
============================================================
[TWS/IB Gateway] ⇄ [FeedAdapter::IBKR] → [EventLog (Parquet, append-only)]
                                           ↘
                                            [Replay] → [Simulator (discrete-event LOB)]
                                           ↘
[OrderBook (L1/L2, C++)] → [Features (C++)] → [Strategy Engine (Python)] → [OMS (C++)] → [OmsAdapter::IBKR]
                                                ↘                               ↘
                                               [Risk Gate (C++)]                 [TCA / Metrics / Alerts]
                                                                            ↘
                                                                  [Observability API] → [Nexus UI "Observatory"]

Hard rule: Strategies never talk to brokers or feeds directly—only via stable interfaces.

============================================================
CORE MODULES & STABLE INTERFACES (DO NOT BREAK WITHOUT RFC)
============================================================
- FeedAdapter → normalized market events (DEPTH_UPDATE, TRADE, BAR, HEARTBEAT)
- EventLog → append-only Arrow/Parquet; deterministic replay
- OrderBook → L1/L2 state, invariants, snapshots/deltas
- Features → pure, deterministic transforms (C++ kernels exposed via pybind11)
- StrategyAPI → features in → intents out {QUOTE, REPLACE, CANCEL}
- OmsAdapter → broker/exchange I/O; idempotent order state machine; reconciles fills
- RiskGate → synchronous pre-trade checks; kill-switch; limits
- Observability API → metrics/logs/events to the Observatory (WebSocket/SSE + REST)

If you add/change interface fields or behavior, write an RFC in /docs/rfcs and update tests.

============================================================
DATA MODEL & SCHEMAS (NORMALIZED, ARROW/PARQUET)
============================================================
Common fields for ALL events:
  ts_event_ns, ts_receive_ns, venue, symbol, source, seq

DEPTH_UPDATE:
  type="DEPTH_UPDATE", side(BID|ASK), price, size, level, op(ADD|UPDATE|DELETE)

TRADE:
  type="TRADE", price, size, aggressor(BUY|SELL|UNKNOWN)

ORDER_EVENT:
  type="ORDER_EVENT", order_id, state(NEW|ACK|REPLACED|CANCELED|FILLED|REJECTED), price, size, filled, reason

Rules:
- Keep both monotonic and wall-clock timestamps.
- Provenance is required for all external/alt-data.
- Snapshot must equal delta replay (parity test).

============================================================
ML/AI STRATEGY PHILOSOPHY
============================================================
- Guardrail baseline: Avellaneda–Stoikov (A–S). Use for inventory control and benchmarking; it is NOT the edge.
- Nexus-MM (proprietary):
  L1: Short-horizon mark-out model (100 ms–1 s). Features: OFI, L1/L2 imbalance, depth slope, burst stats, sentiment surprise → shift quote center from mid to predicted microprice.
  L2: Fill-hazard model P(fill | offset, features, Δt) → choose bid/ask offsets via expected-utility under risk.
  L3: Constrained RL only after simulator parity is strong and if it beats L2 under identical risk/cancel budgets.

Live inference: compact, deterministic models (trees/linear/small NN or distilled); heavy training offline. Nightly refits with drift checks.

============================================================
OBSERVABILITY & THE NEXUS UI ("OBSERVATORY")
============================================================
- The Observatory is the ONLY visualization/control surface.
- Observability API exposes: metrics (Prometheus/OpenMetrics), logs (structured JSON), events (orders, LOB thumbnails, alerts).
- UI features by phase:
  * MVP: system health, per-symbol tiles (spread, trades), latency SLOs, logs.
  * L2/Features: mini LOB, imbalance gauges, microprice vs mid.
  * Simulator: replay viewer (step/play), incident timeline, fills overlay.
  * OMS/Risk: order lifecycles, risk posture (caps, bands, cancel-rate), reject analysis.
  * Paper/Live: daily TCA, model/version badges, drift monitors, guarded kill-switch & pause/resume.
- UI SLA: p95 stream-to-render < 2 s, uptime ≥ 99.9%.

============================================================
CODING STANDARDS (CONDENSED)
============================================================
C++20:
- CMake build; clang/gcc; -Wall -Wextra; RAII; no exceptions across module boundaries.
- Deterministic behavior; no hidden global state; thread-safe queues; consider lock-free in hot paths.
- Tests: GTest + property tests (invariants: no crossed books, depth ≥ 0).

Python 3.11:
- Pure functions where possible; type hints; Pydantic configs.
- Reproducibility: fixed seeds for experiments, artifact versioning.
- Tests: pytest + hypothesis; golden datasets for features and replay parity.

General:
- Pre-commit hooks: clang-format/Black/ruff.
- Every new module must export metrics relevant to SLOs.
- No I/O in tight loops without profiling justification.

============================================================
RISK, COMPLIANCE, SECURITY
============================================================
- Pre-trade limits: price bands, position/notional caps, orders/sec, cancel-rate caps, duplicate-order guard.
- Kill-switch: manual + automated triggers (latency spikes, rejects, connectivity loss).
- Licensing & Web compliance: robots.txt/TOS adherence, provenance stored, data rights validated.
- Secrets: env/secret manager; paper vs live isolation; RBAC via OIDC; least-privilege networking.
- Audit: append-only decision logs with inputs; full reproducible replay.

============================================================
KPIs & SLOs (PHASE-1 TARGETS)
============================================================
Alpha & Execution:
- Mark-outs @ 100 ms / 1 s / 5 s (bps) > 0
- Realized spread (bps, net fees) > 0
- Fill ratio vs pick-off rate; inventory drift; hedge cost

Latency (IBKR phase):
- Data→Book p50<2 ms / p99<10 ms
- Book→Features p50<1 ms / p99<5 ms
- Features→Decision p50<2 ms / p99<10 ms
- Decision→Submit p50<2 ms / p99<10 ms
- Recorder loss = 0; Replay parity = exact

Data Ingestion:
- Freshness median lag < target; duplicate rate < target; source trust ≥ threshold
- 100% compliance with robots.txt/TOS/licensing

UI/Observability:
- Uptime ≥ 99.9%; stream→render p95 < 2 s; all alerts/actions auditable via UI

============================================================
ROADMAP HOOKS FOR CODE GENERATION
============================================================
Phase 0:
- EventLog skeleton (Parquet writer/reader); time utils (monotonic+wall); Observability API scaffold; UI skeleton (Next.js).
Phase 1:
- FeedAdapter::IBKR (quotes/trades); L1 OrderBook w/ invariants; UI health tiles/log tail.
Phase 2:
- Tick-by-tick + L2 (top-5); feature kernels (microprice, OFI, depth slope, bursts); UI mini LOB + feature widgets.
Phase 3:
- Simulator with latency knobs; replay viewer in UI; incident timeline.
Phase 4:
- OMS (idempotent), RiskGate (bands, caps, cancel-rate, kill-switch); UI order lifecycle + risk posture.
Phase 5:
- Paper trading; TCA dashboards; config diff viewer; drift monitors.
Phase 6:
- Tiny live; guarded controls (kill-switch, pause/resume groups); alert center.
Phase 7–9:
- Scale, adapters (vendor/DMA), colo dossier; cross-asset expansion; sentiment/alt-data scale-up; UI global views & factor explainers.

============================================================
TASK PATTERNS FOR LLMs (WHAT TO GENERATE)
============================================================
- C++: header/source for modules above; pybind11 bindings; invariant/property tests; lock-free queue wrappers (benchmarked).
- Python: simulator components; feature calculators; training/eval scripts; TCA report generators; drift monitors.
- Observability API: FastAPI/Go service exposing /metrics, /logs (search), /events (WS/SSE), auth middleware (OIDC).
- UI (Observatory): React components for health tiles, LOB visualizer, order lifecycle, replay viewer, incident timeline, risk widgets.
- Config & CI: schema-validated YAMLs; GitHub Actions; pre-commit config; reproducible build scripts.

Constraints:
- Do not bypass interfaces; do not couple strategies to broker specifics.
- All new endpoints must be authenticated and RBAC-checked.
- Any change impacting schemas/interfaces must include migration notes + tests.

============================================================
GLOSSARY (SHORT)
============================================================
Excellence: uncompromising engineering/research standards and measurable value.
Syntropy: building order from noisy inputs via models and disciplined systems.
Mark-out: P&L measured Δt after fill (100 ms, 1 s, 5 s).
Realized spread: spread captured net of fees and subsequent price move.
OFI: order-flow imbalance from L1/L2 changes.
Replay parity: state reconstructed from recorded deltas must match original.

# End of context.txt
