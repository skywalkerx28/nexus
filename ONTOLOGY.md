# Nexus Market Ontology (SMO) — Plan & Goals

**Status:** Proposal (v1)
**Owner:** Nexus Data & Research
**Scope:** Progressive ontology + relational mappings for **companies, securities, exchanges, indices, people, organizations, sectors/themes, and commodities**; NLP entity linking; sentiment/event aggregation; feature snapshots for ML

---

## 1) Purpose & Goal

Build a **progressive market ontology** that assigns every relevant market entity a **durable internal ID** and encodes **high-signal relationships** between them. This graph—paired with provenance and confidence scoring—enables Nexus to:

* **Join & deduplicate** petabyte-scale **market + web/sentiment** data with precision.
* **Aggregate** signals (price action, news, social, filings) by entity and neighborhood (suppliers/competitors/themes).
* **Explain** model behavior (why a factor moved) in the Nexus Observatory.
* **Feed ML** with **clean, precomputed, auditable features**—kept **off the execution hot path**.

> Principle: **Start small and high-confidence, expand with data.** The ontology grows as ingestion grows. build a thin ontology/ID layer first, then the scraper/sentiment engine on top of it—not the other way around. Use web browser for accurate and factual company information if necessary, to make sure our relational mapping is up to date. 

Why Build a World Market Ontology?
Data Integration and Consistency: Financial markets generate diverse, heterogeneous data (news, order books, social sentiment, corporate actions, macroeconomic data). An ontology formalizes relationships and standardizes concepts across disparate data sources, ensuring consistent interpretation and integration.

Semantic Relationships: Ontologies capture complex relationships between entities such as instruments, companies, sectors, geopolitical events, market states, and participants. This semantic framework enables more effective querying, reasoning, and pattern detection across your data ecosystem.

Enhanced Machine Learning Input: Incorporating an ontology into your data pipeline enriches features with structured knowledge, making your advanced ML algorithms more context-aware. For instance, understanding that a supplier’s news affects a manufacturer helps generate predictive signals beyond raw text or price data.

Scalable Architecture: As your data sources expand, an ontology prevents data fragmentation and management chaos by mapping new data into an existing relational framework. It supports modular expansion and long-term scalability for maintenance and innovation.

Competitive Differentiation: Firms like XTX leverage such structured knowledge representations internally for proprietary signals. Developing a world market ontology positions you well to match and exceed such capabilities with explainable, high-quality trading signals.

---

## 2) What we’re building

1. **Entity Registry (MVP):** Durable `syn_id` for **Company, Security, Exchange, Index, Person, Org, Sector/Theme, Commodity**; mappings to external IDs (FIGI, ISIN, LEI, MIC, Ticker; plus commodity codes like ISO 4217 for FX, ISO 6166/PLATTS/OPIS/ICE/CME symbols where licensed).
2. **Relational Graph (Core Edges):** `ISSUES`, `LISTED_ON`, `BELONGS_TO`, `LEADS`, `OWNS`, `COMPETES_WITH`, `SUPPLIES`, `TRACKS_INDEX`, `DERIVES_FROM` (commodity relationships), `NEWS_ABOUT`.
3. **NLP Entity Linking:** NER → candidate gen (IDs/aliases) → cross-encoder re-rank → **calibrated confidence** → attach content (news/social/filings) to `syn_id`.
4. **Sentiment & Event Layers:** Source-weighted sentiment, novelty/surprise, and normalized event schemas (earnings, guidance, M&A, rating changes, commodity shocks).
5. **Feature Snapshots:** Daily (and later intraday) **precomputed features** per company/security/commodity for models & the Observatory.
6. **Hot-path discipline:** Live strategies read snapshots from a **feature store/Redis cache**; the full graph remains **nearline**.

---

## 3) Why this matters (for ML & Sentiment)

* **Cleaner inputs → better generalization.** Entity-level joins and dedup reduce label noise and leakage.
* **Richer features.** Sector/theme context, supply-chain links, leadership changes, and **k-hop** neighborhood sentiment become structured features.
* **Event alignment.** Normalized timestamps let models align ticks with news/filings/commodity shocks.
* **Explainability.** The graph substantiates attributions (e.g., negative move via supplier outage).
* **Market Sentiment Bot (future):**

  * Uses the ontology to **resolve mentions to syn_ids** (e.g., “TSLA” ↔ `syn_id_security`, “Elon Musk” ↔ `syn_id_person`).
  * Aggregates sentiment **by entity and neighborhood**; publishes calibrated scores to the feature store for models.
  * Enables **interactive drill-downs** in the Observatory (“why did sentiment_1d drop?”).

---

## 4) Architecture (overview)

```
[Market Data (IBKR/vendor)]   [Web/APIs: News, Social, Filings, Macro, Commodities]
            |                                |
 Normalize + IDs (FIGI/ISIN/MIC/Commodity)   |--> Ingest + NLP Entity Linking (calibrated)
            |                                |            |
       [Entity Registry]  <--------------  [Knowledge Graph (edges with provenance)]
                \                                 /
                 \                               /
            [Aggregators: sentiment/events/graph features]
                           |
                     [Feature Store]
                   (daily/intraday)
                    /           \
        [Nexus Models]    [Nexus Observatory]
         (nearline)           (forensics)
```

**Storage:** Columnar (Parquet/ClickHouse) for registry & features; Redis caches for hot slices; optional graph DB (Neo4j/JanusGraph/PGV) or SQL edge tables.
**Provenance:** Every edge/event has `source`, `evidence`, `observed_at`, `confidence`.
**Compliance:** robots.txt/TOS/licensing enforced at ingestion; rights tracked at edge level.

---

## 5) Data model (initial schemas)

### 5.1 Entities & IDs

```sql
CREATE TABLE entity_registry (
  syn_id         STRING PRIMARY KEY,                       -- durable internal ID
  type           ENUM('COMPANY','SECURITY','EXCHANGE','INDEX','PERSON','ORG','SECTOR','THEME','COMMODITY','FX'),
  canonical_name STRING,
  status         ENUM('ACTIVE','INACTIVE','MERGED'),
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP
);

CREATE TABLE identifiers (
  syn_id     STRING,
  scheme     ENUM('FIGI','ISIN','CUSIP','SEDOL','LEI','TICKER','PERMID','WIKIDATA','MIC','RIC','ISDA','ISO_4217','COMMODITY_CODE'),
  value      STRING,
  valid_from TIMESTAMP,
  valid_to   TIMESTAMP,
  UNIQUE(scheme, value)
);

CREATE TABLE aliases (
  syn_id     STRING,
  alias      STRING,
  lang       STRING,
  source     STRING,
  confidence DOUBLE
);

CREATE TABLE attributes (
  syn_id     STRING,
  key        STRING,     -- e.g., 'country','hq_city','sector_gics','theme_ai','commodity_class'
  value      STRING,
  source     STRING,
  asof       TIMESTAMP,
  confidence DOUBLE
);
```

### 5.2 Edges (relationships)

```sql
CREATE TABLE edges (
  src_syn_id   STRING,
  dst_syn_id   STRING,
  rel_type     ENUM(
    'ISSUES',         -- company -> security
    'LISTED_ON',      -- company -> exchange
    'BELONGS_TO',     -- company -> sector/theme OR commodity -> class
    'LEADS',          -- person -> company (role)
    'OWNS',           -- parent -> subsidiary
    'COMPETES_WITH',  -- company <-> company
    'SUPPLIES',       -- supplier -> customer
    'TRACKS_INDEX',   -- security/fund -> index
    'DERIVES_FROM',   -- derivative -> underlying (options/futures/ETPs/commodities)
    'NEWS_ABOUT'      -- content -> entity
  ),
  attrs        JSON,        -- role, stake, weight, tenor, contract_month, etc.
  source       STRING,      -- provider or pipeline name
  evidence     STRING,      -- URL/filing id/doc hash
  observed_at  TIMESTAMP,
  confidence   DOUBLE,      -- 0..1 calibrated
  valid_from   TIMESTAMP,
  valid_to     TIMESTAMP
);
```

### 5.3 Feature snapshots (model-ready)

```sql
CREATE TABLE company_features_daily (
  syn_id                      STRING,
  asof_date                   DATE,
  sector_id                   STRING,
  themes                      ARRAY<STRING>,
  ceo_tenure_days             INT,
  supplier_count_1hop         INT,
  competitor_count            INT,
  sentiment_1d                DOUBLE,
  sentiment_7d                DOUBLE,
  news_novelty_1d             DOUBLE,
  controversy_index           DOUBLE,
  updated_at                  TIMESTAMP
);

CREATE TABLE symbol_features_daily (
  syn_id_security             STRING,
  asof_date                   DATE,
  avg_spread_bps_5d           DOUBLE,
  vol_at_price_5d             DOUBLE,
  realized_vol_5d             DOUBLE,
  earnings_window_flag        BOOL,
  sentiment_1d                DOUBLE,
  commodity_beta_energy_30d   DOUBLE,  -- exposure to commodity factors
  updated_at                  TIMESTAMP
);

CREATE TABLE commodity_features_daily (
  syn_id_commodity            STRING,
  asof_date                   DATE,
  spot_return_1d              DOUBLE,
  curve_shape_score           DOUBLE,  -- contango/backwardation metric
  inventory_signal            DOUBLE,  -- from reports where licensed
  sentiment_1d                DOUBLE,
  macro_event_pressure        DOUBLE,  -- OPEC/Fed/geopolitical normalized
  updated_at                  TIMESTAMP
);
```

---

## 6) Progressive roadmap (8–14 weeks to strong v1)

### Phase A — **Registry MVP (2–4 weeks)**

* Implement `entity_registry`, `identifiers`, `aliases`, `attributes`.
* Seed **US equities** (companies & securities), major **exchanges/indices**, and **benchmark commodities** (e.g., WTI, Brent, Gold, NatGas, Corn, Copper, FX majors).
* Policy: every ingest resolves to a `syn_id` or is **quarantined** with reasons.
  **Exit:** 95%+ of target symbols & commodities resolve; ID conflicts < 0.1%.

### Phase B — **Core Edges (3–4 weeks)**

* Add `ISSUES`, `LISTED_ON`, `BELONGS_TO`, `LEADS`, `DERIVES_FROM`, `TRACKS_INDEX`.
* Provenance & confidence required.
  **Exit:** Daily edge refresh; UI shows company→security/sector/leadership and commodity link cards.

### Phase C — **NLP Linker v1 (3–4 weeks)**

* NER → candidate gen (tickers/aliases/IDs) → cross-encoder re-rank → **calibrated** confidence.
* Write `NEWS_ABOUT(content→syn_id)` for companies & commodities; dedup, language detection, time normalization, license checks.
  **Exit:** Precision ≥ 0.95 at operating threshold; recall ≥ 0.85 on a labeled set.

### Phase D — **Sentiment & Event Aggregators (2–3 weeks)**

* Source-weighted sentiment; novelty/surprise; normalized events (earnings, guidance, M&A, commodity inventory reports, OPEC decisions).
* Emit **daily feature snapshots** for companies, symbols, and commodities.
  **Exit:** Feature store refresh (T+1 06:00 UTC) with drift monitoring.

### Phase E — **Supply/Competition & Themes (ongoing)**

* Curated seed edges for `SUPPLIES` and `COMPETES_WITH`; expand via semi-supervised patterns.
* Theme tags (AI, Energy Storage, Cloud, Defense…) with explicit inclusion criteria.
  **Exit:** Graph features (supplier count, theme exposure, cross-asset links) show stability and predictive lift.

---

## 7) Integration with the **Market Sentiment Bot**

* **Entity resolution:** The bot resolves mentions (tickers, names, executives, products) to `syn_id` via the registry/aliases.
* **Aggregation:** It rolls up sentiment **by entity** and **k-hop neighborhoods** (e.g., AAPL sentiment also influences key suppliers).
* **Publishing:** Writes calibrated features (e.g., `sentiment_1d`, `news_novelty_1d`) to the **feature store** for models and the Observatory.
* **Feedback loop:** Model outcomes inform the bot’s **source trust weights**, improving future aggregation.

---

## 8) How models will use this (practical)

* **Short-horizon models (100ms–5s):**

  * Use **precomputed flags** (earnings window, commodity beta, sector/theme IDs) and **fast sentiment deltas**; no live graph lookups.
* **Mid/overnight models:**

  * Consume **sentiment aggregates**, event features, and **graph features** (supplier risk, theme exposure) from daily snapshots.
* **Execution policy & risk:**

  * Use sector/commodity context for **inventory hedging** (e.g., energy exposure), and for **venue/symbol routing**.

---

## 9) Quality, compliance & governance

* **Provenance:** Every edge/event stores `source`, `evidence`, `observed_at`, `confidence`.
* **Compliance:** robots.txt/TOS/license enforcement; rights metadata attached to edges; removal/rectification APIs.
* **Calibration:** Maintain labeled sets; track **precision/recall**, **Brier score** for confidence.
* **Gates:** Model promotions require **feature SLOs** (freshness, coverage, quality) to be green.

---

## 10) Performance & reliability

* **Columnar first:** Parquet/ClickHouse; partition by date; vectorized scans.
* **Caches:** Redis per-entity slices for hot reads; no graph queries on the live hot path.
* **SLAs:**

  * Feature snapshot daily by **T+1 06:00 UTC** (p95).
  * NLP linker end-to-end latency p95 **< 60 s** from publish (configurable).
  * Observatory query p95 **< 2 s** for typical entity/edge views.

---

## 11) Risks & mitigations

* **Scope creep:** stick to **core edges**; expand only with measured lift.
* **Entity collisions & drift:** quarantine conflicts; human triage; continuous calibration.
* **Compliance exposure:** automated checks + provenance + rights; denylist by source.
* **Hot path latency:** snapshots + caches; **never** block execution on the graph.

---

## 12) KPIs

* **Coverage:** % of target entities with valid `syn_id` + core edges.
* **Linker quality:** precision/recall/F1 on gold sets; false-attach rate < 0.5%.
* **Freshness:** snapshot completion (p95), staleness rate.
* **Data quality:** duplicate rate < threshold; confidence calibration.
* **Model impact:** incremental **bps lift** from ontology-derived features in A/B or backtests.

---

## 13) First two sprints (actionable)

**Sprint 1**

* Implement tables; import FIGI/LEI/MIC + commodity code seeds; `/resolve?scheme=value` API.
* Seed ~1k US equities + 20 core commodities; unit tests + golden datasets.

**Sprint 2**

* Add core edges (`ISSUES`, `LISTED_ON`, `BELONGS_TO`, `LEADS`, `DERIVES_FROM`, `TRACKS_INDEX`) with provenance.
* Prototype NLP linker (aliases+tickers+IDs); calibration harness & labeled set.
* Emit first **company/symbol/commodity_features_daily** with sector/themes and baseline sentiment.

---

### Summary

A **progressive ontology + relational mappings** is the right path: it grounds your ingestion, unlocks powerful sentiment/event features, and gives models clean, auditable inputs—**without** slowing the live execution loop. Built in layers and paired with the Market Sentiment Bot, it becomes a compounding edge for Nexus.
