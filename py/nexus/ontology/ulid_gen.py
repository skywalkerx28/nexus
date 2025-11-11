"""
ULID generation for durable entity IDs.

ULIDs are lexicographically sortable, timestamp-based, 128-bit identifiers.
We prefix them with entity type codes for easy debugging and routing.
"""

from ulid import ULID
from typing import Literal

EntityType = Literal[
    'COMPANY', 'SECURITY', 'EXCHANGE', 'INDEX',
    'PERSON', 'ORG', 'SECTOR', 'THEME',
    'COMMODITY', 'FX'
]

PREFIX_MAP: dict[EntityType, str] = {
    'COMPANY': 'CO',
    'SECURITY': 'SE',
    'EXCHANGE': 'EX',
    'INDEX': 'IX',
    'PERSON': 'PE',
    'ORG': 'OR',
    'SECTOR': 'SC',
    'THEME': 'TH',
    'COMMODITY': 'CM',
    'FX': 'FX',
}

REVERSE_PREFIX_MAP: dict[str, EntityType] = {v: k for k, v in PREFIX_MAP.items()}


def generate_syn_id(entity_type: EntityType) -> str:
    """
    Generate a durable syn_id with type prefix.
    
    Format: {PREFIX}_{ULID}
    Example: CO_01HQXYZ123456789ABCDEFGHJ
    
    Args:
        entity_type: One of the valid EntityType literals
        
    Returns:
        Prefixed ULID string (29 chars: 2 prefix + 1 underscore + 26 ULID)
        
    Raises:
        ValueError: If entity_type is not valid
    """
    if entity_type not in PREFIX_MAP:
        raise ValueError(
            f"Invalid entity_type: {entity_type}. "
            f"Must be one of {list(PREFIX_MAP.keys())}"
        )
    
    prefix = PREFIX_MAP[entity_type]
    ulid_str = str(ULID())
    return f"{prefix}_{ulid_str}"


def parse_syn_id(syn_id: str) -> tuple[EntityType, str]:
    """
    Parse a syn_id into its entity type and ULID components.
    
    Args:
        syn_id: Prefixed ULID string (e.g., "CO_01HQXYZ...")
        
    Returns:
        Tuple of (entity_type, ulid_str)
        
    Raises:
        ValueError: If syn_id format is invalid
    """
    if not syn_id or '_' not in syn_id:
        raise ValueError(f"Invalid syn_id format: {syn_id}")
    
    parts = syn_id.split('_', 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid syn_id format: {syn_id}")
    
    prefix, ulid_str = parts
    
    if prefix not in REVERSE_PREFIX_MAP:
        raise ValueError(
            f"Unknown prefix: {prefix}. "
            f"Valid prefixes: {list(REVERSE_PREFIX_MAP.keys())}"
        )
    
    if len(ulid_str) != 26:
        raise ValueError(f"Invalid ULID length: {len(ulid_str)} (expected 26)")
    
    entity_type = REVERSE_PREFIX_MAP[prefix]
    return entity_type, ulid_str


def validate_syn_id(syn_id: str) -> bool:
    """
    Validate a syn_id format without raising exceptions.
    
    Args:
        syn_id: Prefixed ULID string to validate
        
    Returns:
        True if valid, False otherwise
    """
    try:
        parse_syn_id(syn_id)
        return True
    except ValueError:
        return False

