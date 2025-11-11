# Nexus Market Ontology (SMO) — Implementation Plan

**Status:** Approved — Ready for Implementation (v2)
**Owner:** Nexus Data & Research
**Timeline:** 12 weeks to production-ready v1
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

**Storage:**
- **Registry/Edges:** PostgreSQL (ACID, constraints, transactions); partial indexes for performance.
- **Features:** Parquet in object storage + DuckDB for dev; ClickHouse for production scale.
- **Caching:** Redis keyspaces by `syn_id` for hot slices (UI + models).
- **Avoid:** Graph DBs until k-hop online traversals are proven necessary.

**Provenance:** Every edge/event has `source`, `evidence`, `ingested_at`, `observed_at`, `updated_at`, `confidence`.
**Compliance:** robots.txt/TOS/licensing enforced at ingestion; rights metadata attached to edges; removal/rectification APIs.

---

## 5) Data model (production schemas)

### 5.1 Core Design Principles

**ID Strategy:**
- Use **ULID** with type prefix for lexicographic order and debugging:
  - `CO_01H...` (Company), `SE_01H...` (Security), `EX_01H...` (Exchange)
  - `IX_01H...` (Index), `PE_01H...` (Person), `OR_01H...` (Organization)
  - `SC_01H...` (Sector), `TH_01H...` (Theme), `CM_01H...` (Commodity), `FX_01H...` (FX)
- Merge lineage: `replaces_syn_id[]` array; soft-delete with `status='MERGED'`.

**SCD2 (Slowly Changing Dimension Type 2):**
- Non-overlapping `[valid_from, valid_to)` intervals enforced at write-time.
- `valid_to = NULL` or `'9999-12-31'` for current records.
- Check constraints prevent overlaps per `(syn_id, key)` or `(src_syn_id, dst_syn_id, rel_type)`.

**Temporal Columns:**
- `ingested_at`: raw arrival timestamp (system clock).
- `observed_at`: event time (when the fact was true in the world).
- `updated_at`: last system write timestamp.

**Typed Attributes:**
- `value_string`, `value_number`, `value_json` (exactly one populated).
- `datatype` enum for validation and casting.

**Normalized Enumerations:**
- Lookup tables for `entity_type`, `rel_type`, `scheme_type`, `source_type` to prevent drift.

### 5.2 Entities & IDs

```sql
-- Lookup: entity types
CREATE TABLE entity_types (
  code           VARCHAR(20) PRIMARY KEY,
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO entity_types (code, description) VALUES
  ('COMPANY', 'Public or private company'),
  ('SECURITY', 'Tradable security (equity, bond, derivative)'),
  ('EXCHANGE', 'Trading venue or exchange'),
  ('INDEX', 'Market index or benchmark'),
  ('PERSON', 'Individual (executive, board member)'),
  ('ORG', 'Organization (regulator, industry body)'),
  ('SECTOR', 'Industry sector classification'),
  ('THEME', 'Investment theme or narrative'),
  ('COMMODITY', 'Physical commodity or contract'),
  ('FX', 'Foreign exchange pair');

-- Lookup: identifier schemes
CREATE TABLE scheme_types (
  code           VARCHAR(30) PRIMARY KEY,
  description    TEXT,
  is_licensed    BOOLEAN DEFAULT FALSE,
  license_notes  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO scheme_types (code, description, is_licensed, license_notes) VALUES
  ('FIGI', 'OpenFIGI identifier', FALSE, 'Free via OpenFIGI API with attribution'),
  ('ISIN', 'International Securities Identification Number', FALSE, 'ISO 6166 standard'),
  ('CUSIP', 'Committee on Uniform Securities Identification Procedures', TRUE, 'Licensed from CUSIP Global Services'),
  ('SEDOL', 'Stock Exchange Daily Official List', TRUE, 'Licensed from London Stock Exchange'),
  ('LEI', 'Legal Entity Identifier', FALSE, 'Open data from GLEIF'),
  ('TICKER', 'Exchange ticker symbol', FALSE, 'Public'),
  ('PERMID', 'Refinitiv Permanent Identifier', TRUE, 'Licensed from Refinitiv'),
  ('WIKIDATA', 'Wikidata entity ID', FALSE, 'CC0 public domain'),
  ('MIC', 'Market Identifier Code', FALSE, 'ISO 10383 standard'),
  ('RIC', 'Refinitiv Instrument Code', TRUE, 'Licensed from Refinitiv'),
  ('ISO_4217', 'Currency code', FALSE, 'ISO standard'),
  ('COMMODITY_CODE', 'Generic commodity identifier', FALSE, 'Various sources');

-- Lookup: data sources
CREATE TABLE source_types (
  code           VARCHAR(50) PRIMARY KEY,
  description    TEXT,
  trust_weight   DOUBLE PRECISION DEFAULT 1.0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Core: entity registry
CREATE TABLE entity_registry (
  syn_id             VARCHAR(30) PRIMARY KEY,
  type               VARCHAR(20) NOT NULL REFERENCES entity_types(code),
  canonical_name     TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','MERGED')),
  replaces_syn_id    VARCHAR(30)[] DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_entity_registry_type ON entity_registry(type);
CREATE INDEX idx_entity_registry_status ON entity_registry(status) WHERE status = 'ACTIVE';

-- Identifiers (external ID mappings with SCD2)
CREATE TABLE identifiers (
  syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id),
  scheme         VARCHAR(30) NOT NULL REFERENCES scheme_types(code),
  value          TEXT NOT NULL,
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (syn_id, scheme, valid_from),
  UNIQUE (scheme, value, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX idx_identifiers_scheme_value ON identifiers(scheme, value) WHERE valid_to IS NULL;

-- Aliases (names, abbreviations, translations)
CREATE TABLE aliases (
  syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id),
  alias          TEXT NOT NULL,
  lang           VARCHAR(10),
  source         VARCHAR(50) REFERENCES source_types(code),
  confidence     DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_aliases_alias ON aliases(alias);
CREATE INDEX idx_aliases_syn_id ON aliases(syn_id);

-- Lookup: attribute datatypes
CREATE TABLE attribute_datatypes (
  code           VARCHAR(20) PRIMARY KEY,
  description    TEXT
);
INSERT INTO attribute_datatypes (code, description) VALUES
  ('STRING', 'Text value'),
  ('NUMBER', 'Numeric value'),
  ('JSON', 'Structured JSON object');

-- Attributes (typed, versioned)
CREATE TABLE attributes (
  syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id),
  key            VARCHAR(100) NOT NULL,
  datatype       VARCHAR(20) NOT NULL REFERENCES attribute_datatypes(code),
  value_string   TEXT,
  value_number   DOUBLE PRECISION,
  value_json     JSONB,
  source         VARCHAR(50) REFERENCES source_types(code),
  confidence     DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at    TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (syn_id, key, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK (
    (datatype = 'STRING' AND value_string IS NOT NULL AND value_number IS NULL AND value_json IS NULL) OR
    (datatype = 'NUMBER' AND value_number IS NOT NULL AND value_string IS NULL AND value_json IS NULL) OR
    (datatype = 'JSON' AND value_json IS NOT NULL AND value_string IS NULL AND value_number IS NULL)
  )
);
CREATE INDEX idx_attributes_syn_id_key ON attributes(syn_id, key) WHERE valid_to IS NULL;
```

### 5.3 Edges (relationships)

```sql
-- Lookup: relationship types
CREATE TABLE rel_types (
  code           VARCHAR(30) PRIMARY KEY,
  description    TEXT,
  is_core        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO rel_types (code, description, is_core) VALUES
  ('ISSUES', 'Company issues security', TRUE),
  ('LISTED_ON', 'Security listed on exchange', TRUE),
  ('BELONGS_TO', 'Entity belongs to sector/theme/class', TRUE),
  ('LEADS', 'Person leads organization (CEO, CFO, etc)', TRUE),
  ('DERIVES_FROM', 'Derivative instrument derives from underlying', TRUE),
  ('TRACKS_INDEX', 'Security/fund tracks index', TRUE),
  ('OWNS', 'Parent owns subsidiary', FALSE),
  ('COMPETES_WITH', 'Company competes with company', FALSE),
  ('SUPPLIES', 'Supplier supplies customer', FALSE),
  ('NEWS_ABOUT', 'Content mentions entity', FALSE);

-- Edges (with SCD2 and provenance)
CREATE TABLE edges (
  src_syn_id     VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id),
  dst_syn_id     VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id),
  rel_type       VARCHAR(30) NOT NULL REFERENCES rel_types(code),
  attrs          JSONB,
  source         VARCHAR(50) NOT NULL REFERENCES source_types(code),
  evidence       TEXT,
  confidence     DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at    TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (src_syn_id, dst_syn_id, rel_type, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK (src_syn_id != dst_syn_id)
);
CREATE INDEX idx_edges_src ON edges(src_syn_id, rel_type) WHERE valid_to IS NULL;
CREATE INDEX idx_edges_dst ON edges(dst_syn_id, rel_type) WHERE valid_to IS NULL;
CREATE INDEX idx_edges_observed ON edges(observed_at DESC);

-- Quarantine table for unresolved entities
CREATE TABLE entity_quarantine (
  id                SERIAL PRIMARY KEY,
  raw_identifier    TEXT NOT NULL,
  scheme            VARCHAR(30),
  context           JSONB,
  reason            TEXT NOT NULL,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_syn_id   VARCHAR(30) REFERENCES entity_registry(syn_id),
  resolved_at       TIMESTAMPTZ,
  resolved_by       VARCHAR(100)
);
CREATE INDEX idx_quarantine_unresolved ON entity_quarantine(ingested_at DESC) WHERE resolved_syn_id IS NULL;
```

### 5.4 Feature snapshots (model-ready, Parquet/ClickHouse)

**Storage:** Parquet files partitioned by `asof_date`; DuckDB for dev queries; ClickHouse for production.

```sql
-- Company features (daily)
CREATE TABLE company_features_daily (
  syn_id                      VARCHAR(30) NOT NULL,
  asof_date                   DATE NOT NULL,
  sector_id                   VARCHAR(30),
  themes                      VARCHAR(30)[],
  ceo_tenure_days             INTEGER,
  supplier_count_1hop         INTEGER,
  competitor_count            INTEGER,
  sentiment_1d                DOUBLE PRECISION,
  sentiment_7d                DOUBLE PRECISION,
  news_novelty_1d             DOUBLE PRECISION,
  controversy_index           DOUBLE PRECISION,
  updated_at                  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (syn_id, asof_date)
);

-- Security features (daily)
CREATE TABLE symbol_features_daily (
  syn_id_security             VARCHAR(30) NOT NULL,
  asof_date                   DATE NOT NULL,
  avg_spread_bps_5d           DOUBLE PRECISION,
  vol_at_price_5d             DOUBLE PRECISION,
  realized_vol_5d             DOUBLE PRECISION,
  earnings_window_flag        BOOLEAN,
  sentiment_1d                DOUBLE PRECISION,
  commodity_beta_energy_30d   DOUBLE PRECISION,
  updated_at                  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (syn_id_security, asof_date)
);

-- Commodity features (daily)
CREATE TABLE commodity_features_daily (
  syn_id_commodity            VARCHAR(30) NOT NULL,
  asof_date                   DATE NOT NULL,
  spot_return_1d              DOUBLE PRECISION,
  curve_shape_score           DOUBLE PRECISION,
  inventory_signal            DOUBLE PRECISION,
  sentiment_1d                DOUBLE PRECISION,
  macro_event_pressure        DOUBLE PRECISION,
  updated_at                  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (syn_id_commodity, asof_date)
);
```

---

## 6) Detailed implementation roadmap (12 weeks to production v1)

### Week 1–2: Foundation & Registry MVP

**Deliverables:**
- PostgreSQL schema deployed with all lookup tables, constraints, and indexes.
- ULID generator library integrated (`ulid-py`).
- Seed data: ~1,000 US equities (companies + primary securities), 10 major exchanges, 5 indices, 20 core commodities.
- `/resolve?scheme=<scheme>&value=<value>` API endpoint (FastAPI in `py/nexus/ops/ontology_api.py`).
- `/entities/:syn_id` API endpoint returning entity + identifiers + attributes.
- Unit tests for ID generation, SCD2 constraint enforcement, identifier collision detection.
- Golden dataset for regression testing (100 entities with known mappings).

**Exit Criteria:**
- 95%+ of seed entities resolve via `/resolve`.
- Zero identifier collisions in seed data.
- SCD2 overlap checks pass.
- API p95 latency < 100ms.

**Team Focus:**
- Backend: schema + APIs + ULID generation.
- Data: seed data curation (OpenFIGI, GLEIF, manual research).
- QA: golden dataset + constraint tests.

---

### Week 3–5: Core Edges + UI Integration

**Deliverables:**
- Core edge types implemented: `ISSUES`, `LISTED_ON`, `BELONGS_TO`, `LEADS`, `DERIVES_FROM`, `TRACKS_INDEX`.
- Batch upsert APIs: `POST /edges` and `POST /attributes` with provenance validation.
- `GET /entities/:syn_id/edges?rel_type=&asof=` endpoint.
- Redis caching layer for hot entity slices (registry + edges + latest attributes).
- Entity detail page in `ui/observatory/src/app/entities/[syn_id]/page.tsx`:
  - Registry card (syn_id, type, canonical_name, status).
  - Identifiers table (scheme, value, valid_from, valid_to).
  - Attributes list (key, value, source, confidence, asof).
  - Edges visualization (simple cards/lists, not graph viz yet).
- Daily edge refresh pipeline (cron job).
- Data quality dashboard in Observatory showing:
  - Entity count by type.
  - Edge count by rel_type.
  - Quarantine queue size.
  - Identifier collision alerts.

**Exit Criteria:**
- All seed entities have at least one core edge.
- Entity page loads in < 2s (p95).
- Redis hit rate > 80% for hot entities.
- Daily edge refresh completes in < 10 minutes.

**Team Focus:**
- Backend: edge APIs + Redis integration + cron pipeline.
- Frontend: Entity detail page + data quality dashboard.
- Data: edge curation for seed entities.

---

### Week 6–8: NLP Linker v1 (Rule-Based)

**Deliverables:**
- NLP linker pipeline (`py/nexus/ops/nlp_linker.py`):
  - **Phase 1 only:** Rule-based candidate generation (exact/fuzzy ticker match, alias match, identifier match).
  - Strict confidence thresholds (≥ 0.95 for auto-attach; < 0.95 → quarantine).
  - Quarantine workflow: unresolved entities logged to `entity_quarantine` table.
- Hand-curated gold set (500 labeled examples: ticker mentions, company names, executive names).
- Calibration harness: precision/recall/F1/Brier score computed weekly.
- Quarantine UI in Observatory (`ui/observatory/src/app/quarantine/page.tsx`):
  - List of unresolved entities with context.
  - Manual resolution form (select `syn_id` or create new entity).
- `NEWS_ABOUT` edge generation for resolved entities.
- Linker metrics dashboard in Observatory:
  - Precision/recall/F1 over time.
  - Quarantine queue size and age.
  - False-attach rate (from manual review).

**Exit Criteria:**
- Precision ≥ 0.95 at operating threshold (0.95 confidence).
- Recall ≥ 0.70 on gold set (acceptable for Phase 1 rule-based).
- Quarantine queue < 100 items at steady state.
- Linker p95 latency < 60s end-to-end.

**Team Focus:**
- Backend: linker pipeline + quarantine workflow + metrics.
- Frontend: quarantine UI + linker metrics dashboard.
- Data: gold set curation + weekly calibration review.

---

### Week 9–10: Feature Aggregators + Feature Store

**Deliverables:**
- Feature aggregation pipelines (`py/nexus/ops/feature_aggregators/`):
  - `company_daily.py`: sector/theme lookup, edge counts (suppliers, competitors), CEO tenure.
  - `symbol_daily.py`: earnings window flag, sector/theme IDs.
  - `commodity_daily.py`: spot return, curve shape (if data available).
- Parquet output to `data/features/` partitioned by `asof_date`.
- DuckDB query interface for dev/testing.
- Feature freshness monitoring: emit metrics to Observatory API.
- Feature snapshot SLO: daily refresh by T+1 06:00 UTC (p95).
- Feature API endpoints:
  - `GET /features/company?syn_id=&date=`
  - `GET /features/symbol?syn_id=&date=`
  - `GET /features/commodity?syn_id=&date=`
- Feature quality dashboard in Observatory:
  - Coverage (% entities with features).
  - Freshness (last update timestamp).
  - Staleness alerts (> 36 hours old).

**Exit Criteria:**
- Feature snapshots refresh daily by 06:00 UTC (p95).
- Coverage ≥ 90% for seed entities.
- Feature API p95 latency < 500ms.
- Zero data quality test failures (Great Expectations suite).

**Team Focus:**
- Backend: aggregation pipelines + Parquet I/O + feature APIs.
- Data: feature definitions + quality tests.
- Ops: cron scheduling + monitoring.

---

### Week 11–12: Sentiment Integration + Model Consumption

**Deliverables:**
- Baseline sentiment aggregator (`py/nexus/ops/sentiment_aggregator.py`):
  - **Placeholder for now:** random/mock sentiment scores (real sentiment engine is Phase 2). Mark todo.
  - Writes `sentiment_1d`, `sentiment_7d` to feature tables.
- Model consumption examples:
  - Python notebook demonstrating feature loading via DuckDB.
  - C++ example reading Parquet features (via Arrow).
- Observatory integration:
  - Feature timeline view on Entity detail page.
  - Sentiment drill-down (when real sentiment is available).
- Production readiness:
  - Great Expectations data quality suite for all tables.
  - dbt tests for SCD2 gaps/overlaps, enum validity, identifier uniqueness.
  - Observability: emit ontology metrics to existing `eventlog` (conflicts, quarantine, freshness).
  - Compliance: removal/rectification API (`DELETE /entities/:syn_id/gdpr`).
- Documentation:
  - API reference (OpenAPI spec).
  - Entity resolution guide.
  - Feature catalog (definitions, sources, SLOs).

**Exit Criteria:**
- All KPIs green (coverage, precision, freshness, quality).
- Models can consume features with < 10 lines of code.
- Data quality tests pass on all tables.
- Observatory shows end-to-end entity → edges → features flow.
- Compliance APIs functional and tested.

**Team Focus:**
- Backend: sentiment placeholder + model examples + compliance APIs.
- Data: quality tests + feature catalog.
- Docs: API reference + guides.

---

### Post-Week 12: Ongoing Expansion (Phase 2+)

**Phase 2A (Weeks 13–16): NLP Linker v2 (Cross-Encoder)**
- Integrate cross-encoder reranking (e.g., sentence-transformers).
- Improve recall to ≥ 0.85 while maintaining precision ≥ 0.95.
- Expand to news content, social media mentions, filings.

**Phase 2B (Weeks 17–20): Real Sentiment Engine**
- Replace placeholder with production sentiment pipeline.
- Source-weighted aggregation, novelty/surprise scoring.
- Feedback loop: model outcomes → source trust weights.

**Phase 2C (Weeks 21–24): Supply Chain & Competition Edges**
- Curated seed edges for `SUPPLIES` and `COMPETES_WITH`.
- Semi-supervised expansion via pattern mining.
- Theme tags (AI, Energy Storage, Cloud, Defense) with inclusion criteria.

**Phase 2D (Weeks 25+): Global Expansion**
- Expand to EU, APAC, LATAM equities.
- Multi-language alias support.
- Cross-border entity resolution (ADRs, dual listings).

---

## 7) API Specification (Minimal Surface)

All APIs implemented in `py/nexus/ops/ontology_api.py` using FastAPI.

### 7.1 Entity Resolution

```
GET /resolve?scheme=<scheme>&value=<value>&asof=<timestamp>
```

**Parameters:**
- `scheme` (required): One of `FIGI`, `ISIN`, `TICKER`, `LEI`, etc.
- `value` (required): Identifier value.
- `asof` (optional): Timestamp for historical resolution (default: now).

**Response:**
```json
{
  "syn_id": "CO_01HQ7X...",
  "canonical_name": "Apple Inc.",
  "type": "COMPANY",
  "confidence": 1.0,
  "matched_via": "TICKER",
  "valid_from": "2020-01-01T00:00:00Z",
  "valid_to": null
}
```

**Errors:**
- `404`: No match found (check quarantine).
- `300`: Multiple matches (ambiguous, returns candidates with confidence scores).

---

### 7.2 Entity Retrieval

```
GET /entities/:syn_id?asof=<timestamp>
```

**Response:**
```json
{
  "syn_id": "CO_01HQ7X...",
  "type": "COMPANY",
  "canonical_name": "Apple Inc.",
  "status": "ACTIVE",
  "replaces_syn_id": [],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-11-11T12:00:00Z",
  "identifiers": [
    {"scheme": "TICKER", "value": "AAPL", "valid_from": "...", "valid_to": null},
    {"scheme": "FIGI", "value": "BBG000B9XRY4", "valid_from": "...", "valid_to": null}
  ],
  "attributes": [
    {"key": "country", "value": "US", "datatype": "STRING", "source": "manual", "confidence": 1.0, "asof": "..."}
  ]
}
```

---

### 7.3 Edge Queries

```
GET /entities/:syn_id/edges?rel_type=<type>&direction=<out|in|both>&asof=<timestamp>
```

**Parameters:**
- `rel_type` (optional): Filter by relationship type.
- `direction` (optional): `out` (default), `in`, or `both`.
- `asof` (optional): Historical snapshot.

**Response:**
```json
{
  "syn_id": "CO_01HQ7X...",
  "edges": [
    {
      "src_syn_id": "CO_01HQ7X...",
      "dst_syn_id": "SE_01HQ8Y...",
      "rel_type": "ISSUES",
      "attrs": {"security_type": "common_stock"},
      "source": "manual",
      "confidence": 1.0,
      "valid_from": "...",
      "valid_to": null
    }
  ]
}
```

---

### 7.4 Batch Writes

```
POST /edges
Content-Type: application/json

{
  "edges": [
    {
      "src_syn_id": "CO_01HQ7X...",
      "dst_syn_id": "SE_01HQ8Y...",
      "rel_type": "ISSUES",
      "attrs": {"security_type": "common_stock"},
      "source": "ibkr_ingest",
      "evidence": "https://...",
      "confidence": 0.95,
      "observed_at": "2024-11-11T12:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "inserted": 1,
  "updated": 0,
  "errors": []
}
```

---

```
POST /attributes
Content-Type: application/json

{
  "attributes": [
    {
      "syn_id": "CO_01HQ7X...",
      "key": "sector_gics",
      "datatype": "STRING",
      "value_string": "45",
      "source": "manual",
      "confidence": 1.0,
      "observed_at": "2024-11-11T12:00:00Z"
    }
  ]
}
```

---

### 7.5 Feature Queries

```
GET /features/company?syn_id=<syn_id>&date=<date>
GET /features/symbol?syn_id=<syn_id>&date=<date>
GET /features/commodity?syn_id=<syn_id>&date=<date>
```

**Response:**
```json
{
  "syn_id": "CO_01HQ7X...",
  "asof_date": "2024-11-11",
  "sector_id": "SC_01HQ9Z...",
  "themes": ["TH_01HQA1...", "TH_01HQA2..."],
  "ceo_tenure_days": 1825,
  "supplier_count_1hop": 42,
  "competitor_count": 8,
  "sentiment_1d": 0.15,
  "sentiment_7d": 0.08,
  "news_novelty_1d": 0.32,
  "controversy_index": 0.05,
  "updated_at": "2024-11-11T06:00:00Z"
}
```

---

### 7.6 Quarantine Management

```
GET /quarantine?limit=100&offset=0&resolved=false
```

**Response:**
```json
{
  "items": [
    {
      "id": 123,
      "raw_identifier": "TSLA",
      "scheme": "TICKER",
      "context": {"source": "news_article", "url": "https://..."},
      "reason": "Multiple candidates with similar confidence",
      "ingested_at": "2024-11-11T12:00:00Z",
      "resolved_syn_id": null
    }
  ],
  "total": 42
}
```

---

```
POST /quarantine/:id/resolve
Content-Type: application/json

{
  "syn_id": "CO_01HQ7X...",
  "resolved_by": "user@example.com"
}
```

---

### 7.7 Compliance

```
DELETE /entities/:syn_id/gdpr
Content-Type: application/json

{
  "reason": "GDPR Article 17 request",
  "requester": "user@example.com",
  "evidence": "ticket #12345"
}
```

**Effect:** Soft-deletes entity, sets `status='INACTIVE'`, logs to audit trail.

---

## 8) Integration with the **Market Sentiment Bot**

* **Entity resolution:** The bot resolves mentions (tickers, names, executives, products) to `syn_id` via the registry/aliases.
* **Aggregation:** It rolls up sentiment **by entity** and **k-hop neighborhoods** (e.g., AAPL sentiment also influences key suppliers).
* **Publishing:** Writes calibrated features (e.g., `sentiment_1d`, `news_novelty_1d`) to the **feature store** for models and the Observatory.
* **Feedback loop:** Model outcomes inform the bot’s **source trust weights**, improving future aggregation.

---

## 9) How models will use this (practical)

* **Short-horizon models (100ms–5s):**

  * Use **precomputed flags** (earnings window, commodity beta, sector/theme IDs) and **fast sentiment deltas**; no live graph lookups.
* **Mid/overnight models:**

  * Consume **sentiment aggregates**, event features, and **graph features** (supplier risk, theme exposure) from daily snapshots.
* **Execution policy & risk:**

  * Use sector/commodity context for **inventory hedging** (e.g., energy exposure), and for **venue/symbol routing**.

---

## 10) Quality, compliance & governance

* **Provenance:** Every edge/event stores `source`, `evidence`, `observed_at`, `confidence`.
* **Compliance:** robots.txt/TOS/license enforcement; rights metadata attached to edges; removal/rectification APIs.
* **Calibration:** Maintain labeled sets; track **precision/recall**, **Brier score** for confidence.
* **Gates:** Model promotions require **feature SLOs** (freshness, coverage, quality) to be green.

---

## 11) Performance & reliability

* **Columnar first:** Parquet/ClickHouse; partition by date; vectorized scans.
* **Caches:** Redis per-entity slices for hot reads; no graph queries on the live hot path.
* **SLAs:**

  * Feature snapshot daily by **T+1 06:00 UTC** (p95).
  * NLP linker end-to-end latency p95 **< 60 s** from publish (configurable).
  * Observatory query p95 **< 2 s** for typical entity/edge views.

---

## 12) Risks & mitigations

* **Scope creep:** stick to **core edges**; expand only with measured lift.
* **Entity collisions & drift:** quarantine conflicts; human triage; continuous calibration.
* **Compliance exposure:** automated checks + provenance + rights; denylist by source.
* **Hot path latency:** snapshots + caches; **never** block execution on the graph.

---

## 13) KPIs

* **Coverage:** % of target entities with valid `syn_id` + core edges.
* **Linker quality:** precision/recall/F1 on gold sets; false-attach rate < 0.5%.
* **Freshness:** snapshot completion (p95), staleness rate.
* **Data quality:** duplicate rate < threshold; confidence calibration.
* **Model impact:** incremental **bps lift** from ontology-derived features in A/B or backtests.

---

## 14) Implementation gotchas & best practices

### Critical Gotchas to Avoid

**1. Over-eager Graph DB adoption**
- **Problem:** Jumping to Neo4j/JanusGraph before proving need for k-hop online traversals.
- **Solution:** Start with PostgreSQL + Parquet. Reevaluate only when you need sub-second k-hop queries (you won't for v1).

**2. Free-text attributes only**
- **Problem:** Storing all attributes as strings, requiring downstream parsing and type inference.
- **Solution:** Use typed columns (`value_string`, `value_number`, `value_json`) with `datatype` enum. Enforce at write-time.

**3. Overlapping validity windows**
- **Problem:** Multiple active records for the same `(syn_id, key)` or `(src_syn_id, dst_syn_id, rel_type)`.
- **Solution:** Enforce non-overlapping `[valid_from, valid_to)` intervals with check constraints and application logic. Test rigorously.

**4. Silent identifier collisions**
- **Problem:** Two entities claiming the same `(scheme, value)` pair without detection.
- **Solution:** Unique constraint on `(scheme, value, valid_from)`. Quarantine conflicts with clear reasons. Log to metrics.

**5. Missing temporal columns**
- **Problem:** Only tracking `updated_at`, losing distinction between ingestion time and event time.
- **Solution:** Always use `ingested_at` (system clock), `observed_at` (event time), `updated_at` (last write).

**6. Untyped enumerations**
- **Problem:** Using raw strings for `type`, `rel_type`, `scheme`, `source`; typos cause drift.
- **Solution:** Normalize into lookup tables with foreign key constraints. Prevents `'COMPNAY'` vs `'COMPANY'`.

**7. No quarantine workflow**
- **Problem:** Ambiguous/unresolved entities silently dropped or force-matched incorrectly.
- **Solution:** Quarantine table + UI for human triage. Emit metrics on queue size and age.

**8. Hot path graph queries**
- **Problem:** Blocking execution on live graph traversals (e.g., "find all suppliers of X").
- **Solution:** Precompute features daily; cache hot slices in Redis; never query graph on hot path.

---

### Best Practices

**ULID Generation:**
```python
import ulid
from datetime import datetime

def generate_syn_id(entity_type: str) -> str:
    prefix_map = {
        'COMPANY': 'CO',
        'SECURITY': 'SE',
        'EXCHANGE': 'EX',
        'INDEX': 'IX',
        'PERSON': 'PE',
        'ORG': 'OR',
        'SECTOR': 'SC',
        'THEME': 'TH',
        'COMMODITY': 'CM',
        'FX': 'FX'
    }
    prefix = prefix_map[entity_type]
    return f"{prefix}_{ulid.create()}"
```

**SCD2 Upsert Pattern (Pseudocode):**
```python
def upsert_attribute(syn_id, key, value, datatype, source, confidence, observed_at):
    # Find current active record
    current = db.query("""
        SELECT * FROM attributes
        WHERE syn_id = ? AND key = ? AND valid_to IS NULL
    """, syn_id, key)
    
    if current and current.value != value:
        # Close current record
        db.execute("""
            UPDATE attributes
            SET valid_to = ?, updated_at = NOW()
            WHERE syn_id = ? AND key = ? AND valid_to IS NULL
        """, observed_at, syn_id, key)
    
    # Insert new record
    db.execute("""
        INSERT INTO attributes (syn_id, key, datatype, value_string, value_number, value_json,
                                source, confidence, valid_from, valid_to, ingested_at, observed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), ?, NOW())
    """, syn_id, key, datatype, value_string, value_number, value_json, source, confidence, observed_at, observed_at)
```

**Redis Caching Strategy:**
```python
# Cache key pattern: ontology:entity:{syn_id}
# TTL: 1 hour (refresh on write)

def get_entity_cached(syn_id: str) -> dict:
    cache_key = f"ontology:entity:{syn_id}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Cache miss: query DB
    entity = db.get_entity_with_edges(syn_id)
    redis.setex(cache_key, 3600, json.dumps(entity))
    return entity

def invalidate_entity_cache(syn_id: str):
    redis.delete(f"ontology:entity:{syn_id}")
```

**Data Quality Tests (Great Expectations):**
```python
# Expectation suite for entity_registry
expect_column_values_to_be_unique(column='syn_id')
expect_column_values_to_not_be_null(column='canonical_name')
expect_column_values_to_be_in_set(column='type', value_set=VALID_ENTITY_TYPES)
expect_column_values_to_be_in_set(column='status', value_set=['ACTIVE', 'INACTIVE', 'MERGED'])

# Expectation suite for identifiers (SCD2 check)
expect_compound_columns_to_be_unique(column_list=['syn_id', 'scheme', 'valid_from'])
expect_column_pair_values_A_to_be_greater_than_B(column_A='valid_to', column_B='valid_from', or_equal=False)

# Expectation suite for edges
expect_column_values_to_be_between(column='confidence', min_value=0.0, max_value=1.0)
```

---

## 15) Immediate next steps (Week 1)

### Day 1–2: Schema & Infrastructure
- [ ] Install PostgreSQL (or use existing instance).
- [ ] Create database `nexus_ontology`.
- [ ] Run schema DDL (all lookup tables + core tables).
- [ ] Install `ulid-py`, `psycopg2`, `fastapi`, `redis-py`.
- [ ] Set up Redis instance (local or Docker).

### Day 3–4: Seed Data & APIs
- [ ] Curate seed data CSV files:
  - `seed_companies.csv` (1,000 US equities with TICKER, FIGI, LEI).
  - `seed_exchanges.csv` (10 major exchanges with MIC).
  - `seed_commodities.csv` (20 core commodities with codes).
- [ ] Write seed data loader script (`py/nexus/ops/seed_ontology.py`).
- [ ] Implement `/resolve` and `/entities/:syn_id` endpoints in `py/nexus/ops/ontology_api.py`.
- [ ] Unit tests for ULID generation, identifier resolution, SCD2 constraints.

### Day 5: Golden Dataset & Testing
- [ ] Create golden dataset (`data/ontology/golden_entities.json`) with 100 known mappings.
- [ ] Write regression test suite comparing `/resolve` output to golden dataset.
- [ ] Run tests; fix any identifier collisions or constraint violations.
- [ ] Deploy API locally; test with `curl` or Postman.

**Exit Criteria for Week 1:**
- PostgreSQL schema deployed with all constraints.
- 1,000+ entities seeded with zero collisions.
- `/resolve` and `/entities/:syn_id` APIs functional and tested.
- Golden dataset regression tests passing.

---

## 16) Technology stack summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Registry/Edges** | PostgreSQL 15+ | ACID, constraints, SCD2 support, mature tooling |
| **Feature Store** | Parquet + DuckDB (dev), ClickHouse (prod) | Columnar, fast scans, partition pruning |
| **Caching** | Redis 7+ | Sub-ms reads, keyspace isolation, TTL support |
| **API** | FastAPI + Uvicorn | Async, OpenAPI docs, type hints, fast |
| **ID Generation** | ULID (`ulid-py`) | Lexicographic order, timestamp-sortable, 128-bit |
| **Data Quality** | Great Expectations + dbt | Declarative tests, versioned expectations |
| **Orchestration** | Cron + Makefile (v1), Dagster (v2) | Simple to start, scales to complex DAGs |
| **Observability** | Existing Nexus eventlog + Prometheus | Reuse infrastructure, emit ontology metrics |
| **NLP (Phase 2)** | spaCy + sentence-transformers | NER + cross-encoder reranking |

---

## 17) Summary & decision

**Decision: Build it.**

A **progressive ontology + relational mappings** is the right path for Nexus. It:
- Grounds ingestion with durable IDs and provenance.
- Unlocks powerful sentiment/event features for models.
- Provides clean, auditable inputs without slowing the hot path.
- Enables explainability and forensics in the Observatory.
- Scales from 1,000 entities to millions with the same architecture.

**Core Principles (Non-Negotiable):**
1. **Durable syn_id + SCD2 everywhere:** No shortcuts on temporal validity.
2. **Core edges only to start:** Resist scope creep; expand with measured lift.
3. **Nearline discipline:** Daily snapshots + Redis caches; graph off hot path.
4. **Quarantine first:** Precision > recall; human-in-the-loop for ambiguity.
5. **Provenance always:** `source`, `evidence`, `confidence` on every edge/attribute.

**12-Week Path to Production:**
- Weeks 1–2: Registry MVP + APIs.
- Weeks 3–5: Core edges + UI integration.
- Weeks 6–8: NLP linker v1 (rule-based).
- Weeks 9–10: Feature aggregators + feature store.
- Weeks 11–12: Sentiment integration + model consumption.

**Success Metrics:**
- Coverage ≥ 95% for target entities.
- Linker precision ≥ 0.95, recall ≥ 0.70 (v1).
- Feature refresh by T+1 06:00 UTC (p95).
- Observatory entity page < 2s (p95).
- Zero data quality test failures.

Built in layers and paired with the Market Sentiment Bot (Phase 2), this ontology becomes a **compounding edge** for Nexus—enabling richer models, faster debugging, and cleaner data at petabyte scale.
