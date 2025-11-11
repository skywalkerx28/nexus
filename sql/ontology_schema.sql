-- Nexus Market Ontology Schema
-- PostgreSQL 15+
-- Production-ready with SCD2, constraints, and performance indexes

-- =============================================================================
-- LOOKUP TABLES (Normalized Enumerations)
-- =============================================================================

-- Entity types
CREATE TABLE IF NOT EXISTS entity_types (
    code           VARCHAR(20) PRIMARY KEY,
    description    TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_types_created ON entity_types(created_at DESC);

-- Identifier schemes
CREATE TABLE IF NOT EXISTS scheme_types (
    code           VARCHAR(30) PRIMARY KEY,
    description    TEXT NOT NULL,
    is_licensed    BOOLEAN NOT NULL DEFAULT FALSE,
    license_notes  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheme_types_licensed ON scheme_types(is_licensed);

-- Data sources
CREATE TABLE IF NOT EXISTS source_types (
    code           VARCHAR(50) PRIMARY KEY,
    description    TEXT NOT NULL,
    trust_weight   DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (trust_weight >= 0 AND trust_weight <= 1.0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_types_trust ON source_types(trust_weight DESC);

-- Relationship types
CREATE TABLE IF NOT EXISTS rel_types (
    code           VARCHAR(30) PRIMARY KEY,
    description    TEXT NOT NULL,
    is_core        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_types_core ON rel_types(is_core) WHERE is_core = TRUE;

-- Attribute datatypes
CREATE TABLE IF NOT EXISTS attribute_datatypes (
    code           VARCHAR(20) PRIMARY KEY,
    description    TEXT NOT NULL
);

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Enable btree_gist for exclusion constraints on SCD2 temporal ranges
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enable pg_trgm for fuzzy text matching and similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- CORE ENTITY REGISTRY
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_registry (
    syn_id             VARCHAR(30) PRIMARY KEY,
    type               VARCHAR(20) NOT NULL REFERENCES entity_types(code),
    canonical_name     TEXT NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'MERGED')),
    replaces_syn_id    VARCHAR(30)[],
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_registry_type ON entity_registry(type);
CREATE INDEX IF NOT EXISTS idx_entity_registry_status ON entity_registry(status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_entity_registry_name ON entity_registry USING gin(to_tsvector('english', canonical_name));
CREATE INDEX IF NOT EXISTS idx_entity_registry_name_trgm ON entity_registry USING gin(LOWER(canonical_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entity_registry_created ON entity_registry(created_at DESC);

-- =============================================================================
-- IDENTIFIERS (External ID Mappings with SCD2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS identifiers (
    syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id) ON DELETE CASCADE,
    scheme         VARCHAR(30) NOT NULL REFERENCES scheme_types(code),
    value          TEXT NOT NULL,
    valid_from     TIMESTAMPTZ NOT NULL,
    valid_to       TIMESTAMPTZ,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (syn_id, scheme, valid_from),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Global uniqueness: active identifiers must be unique across all entities
CREATE UNIQUE INDEX IF NOT EXISTS idx_identifiers_unique_active
    ON identifiers(scheme, value)
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_identifiers_syn_id ON identifiers(syn_id);
CREATE INDEX IF NOT EXISTS idx_identifiers_scheme_value ON identifiers(scheme, value);
CREATE INDEX IF NOT EXISTS idx_identifiers_valid_from ON identifiers(valid_from DESC);

-- SCD2 correctness: prevent overlapping validity windows per (syn_id, scheme)
ALTER TABLE identifiers
DROP CONSTRAINT IF EXISTS identifiers_no_overlap;

ALTER TABLE identifiers
ADD CONSTRAINT identifiers_no_overlap
    EXCLUDE USING gist (
        syn_id WITH =,
        scheme WITH =,
        tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz)) WITH &&
    );

-- =============================================================================
-- ALIASES (Names, Abbreviations, Translations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS aliases (
    id             BIGSERIAL PRIMARY KEY,
    syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id) ON DELETE CASCADE,
    alias          TEXT NOT NULL,
    lang           VARCHAR(10),
    source         VARCHAR(50) REFERENCES source_types(code),
    confidence     DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aliases_syn_id ON aliases(syn_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases USING gin(to_tsvector('english', alias));
CREATE INDEX IF NOT EXISTS idx_aliases_alias_lower ON aliases(LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_aliases_alias_trgm ON aliases USING gin(LOWER(alias) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aliases_lang ON aliases(lang) WHERE lang IS NOT NULL;

-- =============================================================================
-- ATTRIBUTES (Typed, Versioned with SCD2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS attributes (
    syn_id         VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_attributes_syn_id_key_active 
    ON attributes(syn_id, key) 
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_attributes_key ON attributes(key);
CREATE INDEX IF NOT EXISTS idx_attributes_valid_from ON attributes(valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_attributes_json ON attributes USING gin(value_json) WHERE value_json IS NOT NULL;

-- SCD2 correctness: prevent overlapping validity windows per (syn_id, key)
ALTER TABLE attributes
DROP CONSTRAINT IF EXISTS attributes_no_overlap;

ALTER TABLE attributes
ADD CONSTRAINT attributes_no_overlap
    EXCLUDE USING gist (
        syn_id WITH =,
        key WITH =,
        tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz)) WITH &&
    );

-- =============================================================================
-- EDGES (Relationships with SCD2 and Provenance)
-- =============================================================================

CREATE TABLE IF NOT EXISTS edges (
    src_syn_id     VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id) ON DELETE CASCADE,
    dst_syn_id     VARCHAR(30) NOT NULL REFERENCES entity_registry(syn_id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_edges_src_rel_active 
    ON edges(src_syn_id, rel_type) 
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_edges_dst_rel_active 
    ON edges(dst_syn_id, rel_type) 
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_edges_observed ON edges(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_edges_confidence ON edges(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_edges_attrs ON edges USING gin(attrs) WHERE attrs IS NOT NULL;

-- SCD2 correctness: prevent overlapping validity windows per (src_syn_id, dst_syn_id, rel_type)
ALTER TABLE edges
DROP CONSTRAINT IF EXISTS edges_no_overlap;

ALTER TABLE edges
ADD CONSTRAINT edges_no_overlap
    EXCLUDE USING gist (
        src_syn_id WITH =,
        dst_syn_id WITH =,
        rel_type WITH =,
        tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz)) WITH &&
    );

-- =============================================================================
-- QUARANTINE (Unresolved Entities)
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_quarantine (
    id                BIGSERIAL PRIMARY KEY,
    raw_identifier    TEXT NOT NULL,
    scheme            VARCHAR(30),
    context           JSONB,
    reason            TEXT NOT NULL,
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_syn_id   VARCHAR(30) REFERENCES entity_registry(syn_id),
    resolved_at       TIMESTAMPTZ,
    resolved_by       VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_quarantine_unresolved 
    ON entity_quarantine(ingested_at DESC) 
    WHERE resolved_syn_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_quarantine_scheme ON entity_quarantine(scheme) WHERE scheme IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quarantine_resolved ON entity_quarantine(resolved_at DESC) WHERE resolved_at IS NOT NULL;

-- =============================================================================
-- AUDIT LOG (Change Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ontology_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    table_name     VARCHAR(50) NOT NULL,
    operation      VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    syn_id         VARCHAR(30),
    old_data       JSONB,
    new_data       JSONB,
    changed_by     VARCHAR(100),
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason         TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_syn_id ON ontology_audit_log(syn_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON ontology_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_op ON ontology_audit_log(table_name, operation);

-- =============================================================================
-- SEED DATA FOR LOOKUP TABLES
-- =============================================================================

-- Entity types
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
    ('FX', 'Foreign exchange pair')
ON CONFLICT (code) DO NOTHING;

-- Identifier schemes
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
    ('COMMODITY_CODE', 'Generic commodity identifier', FALSE, 'Various sources')
ON CONFLICT (code) DO NOTHING;

-- Relationship types
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
    ('NEWS_ABOUT', 'Content mentions entity', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Attribute datatypes
INSERT INTO attribute_datatypes (code, description) VALUES
    ('STRING', 'Text value'),
    ('NUMBER', 'Numeric value'),
    ('JSON', 'Structured JSON object')
ON CONFLICT (code) DO NOTHING;

-- Default source types
INSERT INTO source_types (code, description, trust_weight) VALUES
    ('manual', 'Manual data entry', 1.0),
    ('ibkr_ingest', 'Interactive Brokers ingestion', 0.95),
    ('openfigi', 'OpenFIGI API', 0.90),
    ('gleif', 'GLEIF LEI database', 0.95),
    ('nlp_linker', 'NLP entity linker', 0.80),
    ('web_scraper', 'Web scraping', 0.70)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get active identifiers for an entity
CREATE OR REPLACE FUNCTION get_active_identifiers(p_syn_id VARCHAR(30))
RETURNS TABLE (
    scheme VARCHAR(30),
    value TEXT,
    valid_from TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT i.scheme, i.value, i.valid_from
    FROM identifiers i
    WHERE i.syn_id = p_syn_id
      AND i.valid_to IS NULL
    ORDER BY i.scheme;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get active attributes for an entity
CREATE OR REPLACE FUNCTION get_active_attributes(p_syn_id VARCHAR(30))
RETURNS TABLE (
    key VARCHAR(100),
    datatype VARCHAR(20),
    value_string TEXT,
    value_number DOUBLE PRECISION,
    value_json JSONB,
    source VARCHAR(50),
    confidence DOUBLE PRECISION,
    observed_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.key, a.datatype, a.value_string, a.value_number, a.value_json,
           a.source, a.confidence, a.observed_at
    FROM attributes a
    WHERE a.syn_id = p_syn_id
      AND a.valid_to IS NULL
    ORDER BY a.key;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get active edges for an entity
CREATE OR REPLACE FUNCTION get_active_edges(
    p_syn_id VARCHAR(30),
    p_direction VARCHAR(10) DEFAULT 'out',
    p_rel_type VARCHAR(30) DEFAULT NULL
)
RETURNS TABLE (
    src_syn_id VARCHAR(30),
    dst_syn_id VARCHAR(30),
    rel_type VARCHAR(30),
    attrs JSONB,
    source VARCHAR(50),
    confidence DOUBLE PRECISION,
    observed_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.src_syn_id, e.dst_syn_id, e.rel_type, e.attrs,
           e.source, e.confidence, e.observed_at
    FROM edges e
    WHERE e.valid_to IS NULL
      AND (
          (p_direction = 'out' AND e.src_syn_id = p_syn_id) OR
          (p_direction = 'in' AND e.dst_syn_id = p_syn_id) OR
          (p_direction = 'both' AND (e.src_syn_id = p_syn_id OR e.dst_syn_id = p_syn_id))
      )
      AND (p_rel_type IS NULL OR e.rel_type = p_rel_type)
    ORDER BY e.observed_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- STATISTICS & MONITORING VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW ontology_stats AS
SELECT
    (SELECT COUNT(*) FROM entity_registry WHERE status = 'ACTIVE') as active_entities,
    (SELECT COUNT(*) FROM entity_registry WHERE status = 'MERGED') as merged_entities,
    (SELECT COUNT(*) FROM identifiers WHERE valid_to IS NULL) as active_identifiers,
    (SELECT COUNT(*) FROM aliases) as total_aliases,
    (SELECT COUNT(*) FROM attributes WHERE valid_to IS NULL) as active_attributes,
    (SELECT COUNT(*) FROM edges WHERE valid_to IS NULL) as active_edges,
    (SELECT COUNT(*) FROM entity_quarantine WHERE resolved_syn_id IS NULL) as unresolved_quarantine,
    (SELECT COUNT(DISTINCT type) FROM entity_registry WHERE status = 'ACTIVE') as entity_types_used;

-- =============================================================================
-- GRANTS (Adjust based on your user setup)
-- =============================================================================

-- Example: GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
-- Example: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;

