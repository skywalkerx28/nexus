"""
Entity registry core operations.

Handles entity creation, identifier management, and resolution with SCD2.
"""

from datetime import datetime, timezone
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from .ulid_gen import EntityType, generate_syn_id, validate_syn_id


class EntityRegistry:
    """Core entity registry operations."""
    
    def __init__(self, conn: psycopg.Connection):
        """
        Initialize with a database connection.
        
        Args:
            conn: psycopg connection (from pool)
        """
        self.conn = conn
    
    def create_entity(
        self,
        entity_type: EntityType,
        canonical_name: str,
        status: str = 'ACTIVE',
    ) -> str:
        """
        Create a new entity in the registry.
        
        Args:
            entity_type: Entity type (COMPANY, SECURITY, etc.)
            canonical_name: Primary name for the entity
            status: Entity status (default: ACTIVE)
            
        Returns:
            Generated syn_id
            
        Raises:
            ValueError: If parameters are invalid
            psycopg.Error: If database operation fails
        """
        if not canonical_name or not canonical_name.strip():
            raise ValueError("canonical_name cannot be empty")
        
        if status not in ('ACTIVE', 'INACTIVE', 'MERGED'):
            raise ValueError(f"Invalid status: {status}")
        
        syn_id = generate_syn_id(entity_type)
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO entity_registry (syn_id, type, canonical_name, status)
                VALUES (%s, %s, %s, %s)
                RETURNING syn_id
                """,
                (syn_id, entity_type, canonical_name.strip(), status)
            )
            result = cur.fetchone()
        
        self.conn.commit()
        return result['syn_id']
    
    def get_entity(self, syn_id: str) -> Optional[dict]:
        """
        Get entity by syn_id.
        
        Args:
            syn_id: Entity identifier
            
        Returns:
            Entity dict or None if not found
        """
        if not validate_syn_id(syn_id):
            return None
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT syn_id, type, canonical_name, status,
                       replaces_syn_id, created_at, updated_at
                FROM entity_registry
                WHERE syn_id = %s
                """,
                (syn_id,)
            )
            return cur.fetchone()
    
    def add_identifier(
        self,
        syn_id: str,
        scheme: str,
        value: str,
        valid_from: Optional[datetime] = None,
    ) -> None:
        """
        Add an identifier mapping (with SCD2).
        
        Args:
            syn_id: Entity identifier
            scheme: Identifier scheme (TICKER, FIGI, etc.)
            value: Identifier value
            valid_from: Start of validity (default: now)
            
        Raises:
            ValueError: If parameters are invalid
            psycopg.Error: If database operation fails
        """
        if not validate_syn_id(syn_id):
            raise ValueError(f"Invalid syn_id: {syn_id}")
        
        if not value or not value.strip():
            raise ValueError("Identifier value cannot be empty")
        
        if valid_from is None:
            valid_from = datetime.now(timezone.utc)
        
        with self.conn.cursor() as cur:
            # Check for existing active identifier with same scheme/value
            cur.execute(
                """
                SELECT syn_id FROM identifiers
                WHERE scheme = %s AND value = %s AND valid_to IS NULL
                """,
                (scheme, value.strip())
            )
            existing = cur.fetchone()
            
            if existing and existing['syn_id'] != syn_id:
                raise ValueError(
                    f"Identifier {scheme}:{value} already assigned to {existing['syn_id']}"
                )
            
            # Insert new identifier
            cur.execute(
                """
                INSERT INTO identifiers (syn_id, scheme, value, valid_from)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (syn_id, scheme, valid_from) DO NOTHING
                """,
                (syn_id, scheme, value.strip(), valid_from)
            )
        
        self.conn.commit()
    
    def add_alias(
        self,
        syn_id: str,
        alias: str,
        lang: Optional[str] = None,
        source: Optional[str] = None,
        confidence: float = 1.0,
    ) -> None:
        """
        Add an alias (alternative name) for an entity.
        
        Args:
            syn_id: Entity identifier
            alias: Alternative name
            lang: Language code (e.g., 'en', 'es')
            source: Data source
            confidence: Confidence score (0-1)
            
        Raises:
            ValueError: If parameters are invalid
        """
        if not validate_syn_id(syn_id):
            raise ValueError(f"Invalid syn_id: {syn_id}")
        
        if not alias or not alias.strip():
            raise ValueError("Alias cannot be empty")
        
        if not 0 <= confidence <= 1:
            raise ValueError(f"Confidence must be 0-1, got {confidence}")
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO aliases (syn_id, alias, lang, source, confidence)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (syn_id, alias.strip(), lang, source, confidence)
            )
        
        self.conn.commit()
    
    def resolve_identifier(
        self,
        scheme: str,
        value: str,
        asof: Optional[datetime] = None,
    ) -> Optional[dict]:
        """
        Resolve an identifier to a syn_id (with temporal lookup).
        
        Args:
            scheme: Identifier scheme
            value: Identifier value
            asof: Point-in-time for resolution (default: now)
            
        Returns:
            Dict with syn_id and metadata, or None if not found
        """
        if asof is None:
            asof = datetime.now(timezone.utc)
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT i.syn_id, i.valid_from, i.valid_to,
                       e.canonical_name, e.type, e.status
                FROM identifiers i
                JOIN entity_registry e ON i.syn_id = e.syn_id
                WHERE i.scheme = %s
                  AND i.value = %s
                  AND i.valid_from <= %s
                  AND (i.valid_to IS NULL OR i.valid_to > %s)
                LIMIT 1
                """,
                (scheme, value.strip(), asof, asof)
            )
            return cur.fetchone()
    
    def get_identifiers(self, syn_id: str, active_only: bool = True) -> list[dict]:
        """
        Get all identifiers for an entity.
        
        Args:
            syn_id: Entity identifier
            active_only: If True, only return active identifiers
            
        Returns:
            List of identifier dicts
        """
        if not validate_syn_id(syn_id):
            return []
        
        with self.conn.cursor() as cur:
            if active_only:
                cur.execute(
                    """
                    SELECT scheme, value, valid_from, valid_to
                    FROM identifiers
                    WHERE syn_id = %s AND valid_to IS NULL
                    ORDER BY scheme
                    """,
                    (syn_id,)
                )
            else:
                cur.execute(
                    """
                    SELECT scheme, value, valid_from, valid_to
                    FROM identifiers
                    WHERE syn_id = %s
                    ORDER BY scheme, valid_from DESC
                    """,
                    (syn_id,)
                )
            
            return cur.fetchall()
    
    def get_aliases(self, syn_id: str) -> list[dict]:
        """
        Get all aliases for an entity.
        
        Args:
            syn_id: Entity identifier
            
        Returns:
            List of alias dicts
        """
        if not validate_syn_id(syn_id):
            return []
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT alias, lang, source, confidence, created_at
                FROM aliases
                WHERE syn_id = %s
                ORDER BY confidence DESC, created_at DESC
                """,
                (syn_id,)
            )
            return cur.fetchall()
    
    def search_by_name(self, query: str, limit: int = 10) -> list[dict]:
        """
        Search entities by name (full-text search).
        
        Args:
            query: Search query
            limit: Maximum results to return
            
        Returns:
            List of matching entities
        """
        if not query or not query.strip():
            return []
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT syn_id, type, canonical_name, status,
                       ts_rank(to_tsvector('english', canonical_name), 
                               plainto_tsquery('english', %s)) as rank
                FROM entity_registry
                WHERE status = 'ACTIVE'
                  AND to_tsvector('english', canonical_name) @@ plainto_tsquery('english', %s)
                ORDER BY rank DESC, canonical_name
                LIMIT %s
                """,
                (query.strip(), query.strip(), limit)
            )
            return cur.fetchall()

