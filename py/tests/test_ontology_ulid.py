"""
Unit tests for ULID generation and parsing.
"""

import pytest
from nexus.ontology.ulid_gen import (
    generate_syn_id,
    parse_syn_id,
    validate_syn_id,
    EntityType,
    PREFIX_MAP,
)


class TestULIDGeneration:
    """Test ULID generation."""
    
    def test_generate_company_id(self):
        """Test generating a company syn_id."""
        syn_id = generate_syn_id('COMPANY')
        assert syn_id.startswith('CO_')
        assert len(syn_id) == 29
    
    def test_generate_security_id(self):
        """Test generating a security syn_id."""
        syn_id = generate_syn_id('SECURITY')
        assert syn_id.startswith('SE_')
        assert len(syn_id) == 29
    
    def test_generate_all_types(self):
        """Test generating IDs for all entity types."""
        for entity_type in PREFIX_MAP.keys():
            syn_id = generate_syn_id(entity_type)
            prefix = PREFIX_MAP[entity_type]
            assert syn_id.startswith(f"{prefix}_")
            assert len(syn_id) == 29
    
    def test_generate_unique_ids(self):
        """Test that generated IDs are unique."""
        ids = {generate_syn_id('COMPANY') for _ in range(100)}
        assert len(ids) == 100
    
    def test_invalid_entity_type(self):
        """Test that invalid entity type raises ValueError."""
        with pytest.raises(ValueError, match="Invalid entity_type"):
            generate_syn_id('INVALID')


class TestULIDParsing:
    """Test ULID parsing."""
    
    def test_parse_valid_company_id(self):
        """Test parsing a valid company syn_id."""
        syn_id = generate_syn_id('COMPANY')
        entity_type, ulid_str = parse_syn_id(syn_id)
        assert entity_type == 'COMPANY'
        assert len(ulid_str) == 26
    
    def test_parse_all_types(self):
        """Test parsing all entity types."""
        for entity_type in PREFIX_MAP.keys():
            syn_id = generate_syn_id(entity_type)
            parsed_type, ulid_str = parse_syn_id(syn_id)
            assert parsed_type == entity_type
            assert len(ulid_str) == 26
    
    def test_parse_invalid_format(self):
        """Test that invalid format raises ValueError."""
        with pytest.raises(ValueError, match="Invalid syn_id format"):
            parse_syn_id("INVALID")
    
    def test_parse_invalid_prefix(self):
        """Test that invalid prefix raises ValueError."""
        with pytest.raises(ValueError, match="Unknown prefix"):
            parse_syn_id("XX_01HQXYZ123456789ABCDEFGH")
    
    def test_parse_invalid_ulid_length(self):
        """Test that invalid ULID length raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ULID length"):
            parse_syn_id("CO_TOOSHORT")


class TestULIDValidation:
    """Test ULID validation."""
    
    def test_validate_valid_id(self):
        """Test validating a valid syn_id."""
        syn_id = generate_syn_id('COMPANY')
        assert validate_syn_id(syn_id) is True
    
    def test_validate_invalid_id(self):
        """Test validating an invalid syn_id."""
        assert validate_syn_id("INVALID") is False
        assert validate_syn_id("XX_01HQXYZ123456789ABCDEFGH") is False
        assert validate_syn_id("CO_TOOSHORT") is False
    
    def test_validate_empty_string(self):
        """Test validating an empty string."""
        assert validate_syn_id("") is False
    
    def test_validate_none(self):
        """Test validating None."""
        with pytest.raises(AttributeError):
            validate_syn_id(None)

