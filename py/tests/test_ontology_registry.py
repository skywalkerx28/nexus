"""
Integration tests for entity registry operations.

Requires a test database to be set up.
"""

import os
import pytest
from datetime import datetime, timezone

from nexus.ontology.db import get_db_connection
from nexus.ontology.registry import EntityRegistry


@pytest.fixture(scope="module")
def test_db():
    """Set up test database connection."""
    # Use test database
    os.environ['ONTOLOGY_DB_NAME'] = 'nexus_ontology_test'
    
    # Note: This assumes test DB is already created and schema applied
    # Run: createdb nexus_ontology_test && psql nexus_ontology_test < sql/ontology_schema.sql
    
    yield
    
    # Cleanup: truncate tables after tests
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE entity_registry CASCADE")
        conn.commit()


@pytest.fixture
def registry():
    """Get a registry instance."""
    with get_db_connection() as conn:
        yield EntityRegistry(conn)


class TestEntityCreation:
    """Test entity creation."""
    
    def test_create_company(self, test_db, registry):
        """Test creating a company entity."""
        syn_id = registry.create_entity(
            entity_type='COMPANY',
            canonical_name='Test Corp',
            status='ACTIVE',
        )
        
        assert syn_id.startswith('CO_')
        assert len(syn_id) == 29
        
        # Verify entity was created
        entity = registry.get_entity(syn_id)
        assert entity is not None
        assert entity['canonical_name'] == 'Test Corp'
        assert entity['type'] == 'COMPANY'
        assert entity['status'] == 'ACTIVE'
    
    def test_create_security(self, test_db, registry):
        """Test creating a security entity."""
        syn_id = registry.create_entity(
            entity_type='SECURITY',
            canonical_name='Test Stock',
        )
        
        assert syn_id.startswith('SE_')
        entity = registry.get_entity(syn_id)
        assert entity['type'] == 'SECURITY'
    
    def test_create_with_empty_name(self, test_db, registry):
        """Test that empty name raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            registry.create_entity(
                entity_type='COMPANY',
                canonical_name='',
            )
    
    def test_create_with_invalid_status(self, test_db, registry):
        """Test that invalid status raises ValueError."""
        with pytest.raises(ValueError, match="Invalid status"):
            registry.create_entity(
                entity_type='COMPANY',
                canonical_name='Test',
                status='INVALID',
            )


class TestIdentifierManagement:
    """Test identifier operations."""
    
    def test_add_identifier(self, test_db, registry):
        """Test adding an identifier."""
        syn_id = registry.create_entity('COMPANY', 'Test Corp')
        
        registry.add_identifier(syn_id, 'TICKER', 'TEST')
        
        identifiers = registry.get_identifiers(syn_id)
        assert len(identifiers) == 1
        assert identifiers[0]['scheme'] == 'TICKER'
        assert identifiers[0]['value'] == 'TEST'
    
    def test_add_multiple_identifiers(self, test_db, registry):
        """Test adding multiple identifiers."""
        syn_id = registry.create_entity('COMPANY', 'Test Corp')
        
        registry.add_identifier(syn_id, 'TICKER', 'TEST')
        registry.add_identifier(syn_id, 'FIGI', 'BBG000TEST')
        registry.add_identifier(syn_id, 'ISIN', 'US0000000000')
        
        identifiers = registry.get_identifiers(syn_id)
        assert len(identifiers) == 3
        
        schemes = {i['scheme'] for i in identifiers}
        assert schemes == {'TICKER', 'FIGI', 'ISIN'}
    
    def test_identifier_collision(self, test_db, registry):
        """Test that identifier collision is detected."""
        syn_id1 = registry.create_entity('COMPANY', 'Test Corp 1')
        syn_id2 = registry.create_entity('COMPANY', 'Test Corp 2')
        
        registry.add_identifier(syn_id1, 'TICKER', 'TEST')
        
        with pytest.raises(ValueError, match="already assigned"):
            registry.add_identifier(syn_id2, 'TICKER', 'TEST')
    
    def test_resolve_identifier(self, test_db, registry):
        """Test resolving an identifier."""
        syn_id = registry.create_entity('COMPANY', 'Test Corp')
        registry.add_identifier(syn_id, 'TICKER', 'TEST')
        
        result = registry.resolve_identifier('TICKER', 'TEST')
        
        assert result is not None
        assert result['syn_id'] == syn_id
        assert result['canonical_name'] == 'Test Corp'
    
    def test_resolve_nonexistent(self, test_db, registry):
        """Test resolving a nonexistent identifier."""
        result = registry.resolve_identifier('TICKER', 'NONEXISTENT')
        assert result is None


class TestAliases:
    """Test alias operations."""
    
    def test_add_alias(self, test_db, registry):
        """Test adding an alias."""
        syn_id = registry.create_entity('COMPANY', 'Test Corporation')
        
        registry.add_alias(syn_id, 'Test Corp', lang='en', confidence=0.95)
        
        aliases = registry.get_aliases(syn_id)
        assert len(aliases) == 1
        assert aliases[0]['alias'] == 'Test Corp'
        assert aliases[0]['lang'] == 'en'
        assert aliases[0]['confidence'] == 0.95
    
    def test_add_multiple_aliases(self, test_db, registry):
        """Test adding multiple aliases."""
        syn_id = registry.create_entity('COMPANY', 'Test Corporation')
        
        registry.add_alias(syn_id, 'Test Corp')
        registry.add_alias(syn_id, 'TestCo')
        registry.add_alias(syn_id, 'TC')
        
        aliases = registry.get_aliases(syn_id)
        assert len(aliases) == 3


class TestSearch:
    """Test search operations."""
    
    def test_search_by_name(self, test_db, registry):
        """Test full-text search."""
        # Create test entities
        registry.create_entity('COMPANY', 'Apple Inc.')
        registry.create_entity('COMPANY', 'Microsoft Corporation')
        registry.create_entity('COMPANY', 'Amazon.com Inc.')
        
        # Search for "apple"
        results = registry.search_by_name('apple', limit=10)
        
        assert len(results) >= 1
        assert any('Apple' in r['canonical_name'] for r in results)
    
    def test_search_empty_query(self, test_db, registry):
        """Test search with empty query."""
        results = registry.search_by_name('', limit=10)
        assert len(results) == 0

