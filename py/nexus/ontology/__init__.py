"""
Nexus Market Ontology

Progressive entity resolution, relational graph, and feature store
for clean, auditable ML inputs.
"""

from .ulid_gen import generate_syn_id, parse_syn_id
from .db import get_db_connection, get_db_pool

__all__ = [
    'generate_syn_id',
    'parse_syn_id',
    'get_db_connection',
    'get_db_pool',
]

