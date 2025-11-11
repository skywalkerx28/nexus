"""
Edge management for the ontology graph.

Handles relationship creation, updates, and queries with SCD2 temporal tracking.
"""

import json
from datetime import datetime, timezone
from typing import Optional

import psycopg
from psycopg.types.json import Jsonb

from .ulid_gen import validate_syn_id


class EdgeManager:
    """Manage edges (relationships) between entities."""
    
    def __init__(self, conn: psycopg.Connection):
        """
        Initialize with a database connection.
        
        Args:
            conn: psycopg connection (from pool)
        """
        self.conn = conn
    
    def add_edge(
        self,
        src_syn_id: str,
        dst_syn_id: str,
        rel_type: str,
        source: str,
        confidence: float,
        attrs: Optional[dict] = None,
        evidence: Optional[str] = None,
        observed_at: Optional[datetime] = None,
        valid_from: Optional[datetime] = None,
    ) -> tuple[bool, bool]:
        """
        Add or update an edge with SCD2 temporal tracking.
        
        If an active edge exists with different attributes, it will be closed
        and a new edge created (SCD2 pattern).
        
        NOTE: Does NOT commit. Caller must commit the transaction.
        
        Args:
            src_syn_id: Source entity identifier
            dst_syn_id: Destination entity identifier
            rel_type: Relationship type (must exist in rel_types table)
            source: Data source identifier
            confidence: Confidence score (0-1)
            attrs: Optional JSON attributes
            evidence: Optional evidence reference (URL, filing ID, etc.)
            observed_at: When the relationship was observed (default: now)
            valid_from: Start of validity (default: observed_at)
            
        Returns:
            Tuple of (inserted, updated) booleans
            
        Raises:
            ValueError: If parameters are invalid
            psycopg.Error: If database operation fails
        """
        # Validate inputs
        if not validate_syn_id(src_syn_id):
            raise ValueError(f"Invalid src_syn_id: {src_syn_id}")
        
        if not validate_syn_id(dst_syn_id):
            raise ValueError(f"Invalid dst_syn_id: {dst_syn_id}")
        
        if src_syn_id == dst_syn_id:
            raise ValueError("Source and destination cannot be the same")
        
        if not 0 <= confidence <= 1:
            raise ValueError(f"Confidence must be 0-1, got {confidence}")
        
        if observed_at is None:
            observed_at = datetime.now(timezone.utc)
        
        if valid_from is None:
            valid_from = observed_at
        
        with self.conn.cursor() as cur:
            # Check if active edge exists with same attributes
            cur.execute(
                """
                SELECT src_syn_id, attrs, confidence, source, evidence
                FROM edges
                WHERE src_syn_id = %s
                  AND dst_syn_id = %s
                  AND rel_type = %s
                  AND valid_to IS NULL
                """,
                (src_syn_id, dst_syn_id, rel_type)
            )
            existing = cur.fetchone()
            
            if existing:
                # Check if any significant field changed
                attrs_changed = existing['attrs'] != attrs
                confidence_changed = abs(existing['confidence'] - confidence) > 0.01
                source_changed = existing['source'] != source
                evidence_changed = existing['evidence'] != evidence
                
                if attrs_changed or confidence_changed or source_changed or evidence_changed:
                    # Close existing edge (SCD2)
                    cur.execute(
                        """
                        UPDATE edges
                        SET valid_to = %s, updated_at = NOW()
                        WHERE src_syn_id = %s
                          AND dst_syn_id = %s
                          AND rel_type = %s
                          AND valid_to IS NULL
                        """,
                        (valid_from, src_syn_id, dst_syn_id, rel_type)
                    )
                    
                    # Insert new version
                    cur.execute(
                        """
                        INSERT INTO edges (
                            src_syn_id, dst_syn_id, rel_type, attrs,
                            source, evidence, confidence,
                            valid_from, observed_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            src_syn_id, dst_syn_id, rel_type, Jsonb(attrs) if attrs else None,
                            source, evidence, confidence,
                            valid_from, observed_at
                        )
                    )
                    return (False, True)  # Updated
                else:
                    # No change, skip insert
                    return (False, False)  # No-op
            
            # Insert new edge
            cur.execute(
                """
                INSERT INTO edges (
                    src_syn_id, dst_syn_id, rel_type, attrs,
                    source, evidence, confidence,
                    valid_from, observed_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    src_syn_id, dst_syn_id, rel_type, Jsonb(attrs) if attrs else None,
                    source, evidence, confidence,
                    valid_from, observed_at
                )
            )
            return (True, False)  # Inserted
    
    def get_edges(
        self,
        syn_id: str,
        direction: str = 'out',
        rel_type: Optional[str] = None,
        active_only: bool = True,
        asof: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        Get edges for an entity with pagination.
        
        Args:
            syn_id: Entity identifier
            direction: 'out' (outgoing), 'in' (incoming), or 'both'
            rel_type: Optional filter by relationship type
            active_only: If True, only return active edges
            asof: Point-in-time for historical queries (default: now)
            limit: Maximum number of results (default: 100, max: 1000)
            offset: Number of results to skip (default: 0)
            
        Returns:
            List of edge dicts with entity details
        """
        if not validate_syn_id(syn_id):
            return []
        
        if direction not in ('out', 'in', 'both'):
            raise ValueError(f"Invalid direction: {direction}")
        
        # Validate and cap pagination
        limit = min(max(1, limit), 1000)
        offset = max(0, offset)
        
        if asof is None:
            asof = datetime.now(timezone.utc)
        
        with self.conn.cursor() as cur:
            # Build query based on direction
            if direction == 'out':
                direction_clause = "e.src_syn_id = %s"
                entity_join = """
                    LEFT JOIN entity_registry dst_entity 
                        ON e.dst_syn_id = dst_entity.syn_id
                """
                entity_select = """
                    e.dst_syn_id as related_syn_id,
                    dst_entity.canonical_name as related_name,
                    dst_entity.type as related_type
                """
            elif direction == 'in':
                direction_clause = "e.dst_syn_id = %s"
                entity_join = """
                    LEFT JOIN entity_registry src_entity 
                        ON e.src_syn_id = src_entity.syn_id
                """
                entity_select = """
                    e.src_syn_id as related_syn_id,
                    src_entity.canonical_name as related_name,
                    src_entity.type as related_type
                """
            else:  # both
                direction_clause = "(e.src_syn_id = %s OR e.dst_syn_id = %s)"
                entity_join = """
                    LEFT JOIN entity_registry src_entity 
                        ON e.src_syn_id = src_entity.syn_id
                    LEFT JOIN entity_registry dst_entity 
                        ON e.dst_syn_id = dst_entity.syn_id
                """
                entity_select = """
                    CASE 
                        WHEN e.src_syn_id = %s THEN e.dst_syn_id
                        ELSE e.src_syn_id
                    END as related_syn_id,
                    CASE 
                        WHEN e.src_syn_id = %s THEN dst_entity.canonical_name
                        ELSE src_entity.canonical_name
                    END as related_name,
                    CASE 
                        WHEN e.src_syn_id = %s THEN dst_entity.type
                        ELSE src_entity.type
                    END as related_type
                """
            
            # Build temporal clause
            if active_only:
                temporal_clause = "AND e.valid_to IS NULL"
                params = [syn_id] if direction != 'both' else [syn_id, syn_id, syn_id, syn_id, syn_id]
            else:
                temporal_clause = """
                    AND e.valid_from <= %s
                    AND (e.valid_to IS NULL OR e.valid_to > %s)
                """
                if direction == 'both':
                    params = [syn_id, syn_id, syn_id, syn_id, syn_id, asof, asof]
                else:
                    params = [syn_id, asof, asof]
            
            # Add rel_type filter if specified
            rel_type_clause = ""
            if rel_type:
                rel_type_clause = "AND e.rel_type = %s"
                params.append(rel_type)
            
            query = f"""
                SELECT 
                    e.src_syn_id,
                    e.dst_syn_id,
                    e.rel_type,
                    e.attrs,
                    e.source,
                    e.evidence,
                    e.confidence,
                    e.valid_from,
                    e.valid_to,
                    e.observed_at,
                    {entity_select}
                FROM edges e
                {entity_join}
                WHERE {direction_clause}
                  {temporal_clause}
                  {rel_type_clause}
                ORDER BY e.observed_at DESC, e.confidence DESC
                LIMIT %s OFFSET %s
            """
            
            params.extend([limit, offset])
            cur.execute(query, params)
            return cur.fetchall()
    
    def delete_edge(
        self,
        src_syn_id: str,
        dst_syn_id: str,
        rel_type: str,
        valid_to: Optional[datetime] = None,
    ) -> bool:
        """
        Close an active edge (SCD2 soft delete).
        
        NOTE: Does NOT commit. Caller must commit the transaction.
        
        Args:
            src_syn_id: Source entity identifier
            dst_syn_id: Destination entity identifier
            rel_type: Relationship type
            valid_to: End of validity (default: now)
            
        Returns:
            True if edge was closed, False if not found
        """
        if not validate_syn_id(src_syn_id) or not validate_syn_id(dst_syn_id):
            return False
        
        if valid_to is None:
            valid_to = datetime.now(timezone.utc)
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE edges
                SET valid_to = %s, updated_at = NOW()
                WHERE src_syn_id = %s
                  AND dst_syn_id = %s
                  AND rel_type = %s
                  AND valid_to IS NULL
                RETURNING src_syn_id
                """,
                (valid_to, src_syn_id, dst_syn_id, rel_type)
            )
            result = cur.fetchone()
        
        return result is not None
    
    def get_edge_stats(self) -> dict:
        """
        Get edge statistics.
        
        Returns:
            Dict with edge counts by type
        """
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    rel_type,
                    COUNT(*) as total_count,
                    COUNT(*) FILTER (WHERE valid_to IS NULL) as active_count,
                    AVG(confidence) as avg_confidence
                FROM edges
                GROUP BY rel_type
                ORDER BY active_count DESC
                """
            )
            results = cur.fetchall()
        
        total_active = sum(r['active_count'] for r in results)
        total = sum(r['total_count'] for r in results)
        
        return {
            'by_type': results,
            'total_active': total_active,
            'total': total,
            'historical': total - total_active,  # Closed edges
        }

