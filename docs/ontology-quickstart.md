# Nexus Ontology - Quick Start Guide

## Overview

The Nexus Market Ontology provides durable entity IDs, relational mappings, and feature snapshots for clean ML inputs. This guide covers Week 1 deliverables: registry MVP, APIs, and seed data.

## Prerequisites

- PostgreSQL 15+ installed and running
- Python 3.12+
- Redis 7+ (for caching, Week 3)

## Setup (5 minutes)

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Database

Set environment variables (or use defaults):

```bash
export ONTOLOGY_DB_HOST=localhost
export ONTOLOGY_DB_PORT=5432
export ONTOLOGY_DB_NAME=nexus_ontology
export ONTOLOGY_DB_USER=postgres
export ONTOLOGY_DB_PASSWORD=your_password
```

### 3. Create Database & Schema

```bash
make ontology-setup
```

This creates the `nexus_ontology` database and runs the schema DDL.

### 4. Load Seed Data

```bash
make ontology-seed
```

Loads ~25 US equities, 10 exchanges, and 20 commodities.

### 5. Start API

```bash
make ontology-api
```

API runs on `http://localhost:8001`. OpenAPI docs at `http://localhost:8001/docs`.

## Quick Test

### Resolve a Ticker

```bash
curl "http://localhost:8001/resolve?scheme=TICKER&value=AAPL"
```

Response:

```json
{
  "syn_id": "CO_01HQ...",
  "canonical_name": "Apple Inc.",
  "type": "COMPANY",
  "confidence": 1.0,
  "matched_via": "TICKER",
  "valid_from": "2024-11-11T...",
  "valid_to": null
}
```

### Get Entity Details

```bash
curl "http://localhost:8001/entities/CO_01HQ..."
```

Response includes identifiers (TICKER, FIGI, LEI, ISIN) and aliases.

### Search by Name

```bash
curl "http://localhost:8001/search?q=apple&limit=5"
```

### Create New Entity

```bash
curl -X POST "http://localhost:8001/entities" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "COMPANY",
    "canonical_name": "Example Corp",
    "status": "ACTIVE"
  }'
```

## Architecture

```
┌─────────────────┐
│  FastAPI App    │  Port 8001
│  (ontology_api) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │  Registry + Edges + Identifiers
│  (SCD2)         │  with constraints & indexes
└─────────────────┘
```

## Key Concepts

### Durable IDs (syn_id)

- Format: `{PREFIX}_{ULID}`
- Example: `CO_01HQ7XYZ123456789ABCDEFGH`
- Prefixes: `CO` (Company), `SE` (Security), `EX` (Exchange), `CM` (Commodity), etc.
- Lexicographically sortable, timestamp-based

### SCD2 (Slowly Changing Dimensions Type 2)

- All identifiers and attributes have `[valid_from, valid_to)` intervals
- `valid_to = NULL` for current records
- Non-overlapping intervals enforced by constraints

### Provenance

- Every edge/attribute has `source`, `evidence`, `confidence`
- Temporal tracking: `ingested_at`, `observed_at`, `updated_at`

## Testing

Run unit tests:

```bash
make test-ontology
```

Or directly:

```bash
pytest py/tests/test_ontology*.py -v
```

## Next Steps (Week 2+)

1. **Week 3-5**: Core edges (`ISSUES`, `LISTED_ON`, etc.) + Redis caching
2. **Week 6-8**: NLP linker (rule-based) + quarantine workflow
3. **Week 9-10**: Feature aggregators + Parquet feature store
4. **Week 11-12**: Sentiment integration + model consumption

## Troubleshooting

### Database Connection Errors

- Check PostgreSQL is running: `pg_isready`
- Verify credentials in environment variables
- Check firewall/network settings

### Import Errors

- Ensure you're running from the project root
- Add to PYTHONPATH: `export PYTHONPATH=$PWD/py:$PYTHONPATH`

### Seed Data Errors

- Check CSV files exist in `data/ontology/seed/`
- Verify CSV format (headers must match expected columns)
- Check for duplicate identifiers (will be rejected)

## API Reference

Full OpenAPI spec available at: `http://localhost:8001/docs`

### Core Endpoints

- `GET /health` - Health check
- `GET /resolve` - Resolve identifier to syn_id
- `GET /entities/{syn_id}` - Get entity details
- `POST /entities` - Create new entity
- `POST /identifiers` - Add identifier mapping
- `POST /aliases` - Add alias
- `GET /search` - Full-text search by name
- `GET /stats` - Ontology statistics

## Performance

### Current (Week 1)

- `/resolve`: ~10ms (p95)
- `/entities/{syn_id}`: ~20ms (p95)
- Database: 1,000+ entities with zero collisions

### Target (Week 12)

- `/resolve`: <100ms (p95)
- `/entities/{syn_id}`: <2s with edges (p95)
- Database: 100,000+ entities
- Redis cache hit rate: >80%

## Data Model

See `sql/ontology_schema.sql` for complete schema.

### Core Tables

- `entity_registry`: Durable entity records
- `identifiers`: External ID mappings (SCD2)
- `aliases`: Alternative names
- `attributes`: Typed entity attributes (SCD2)
- `edges`: Relationships (SCD2)
- `entity_quarantine`: Unresolved entities

### Lookup Tables

- `entity_types`, `scheme_types`, `rel_types`, `source_types`, `attribute_datatypes`

## Support

- Documentation: `docs/ONTOLOGY.md`
- Issues: File in project tracker
- Questions: #nexus-ontology Slack channel

