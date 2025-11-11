"""
Attribute management for entities.

Handles typed attribute upserts with SCD2 temporal tracking.
"""

from datetime import datetime, timezone
from typing import Optional, Union

import psycopg

from .ulid_gen import validate_syn_id


class AttributeManager:
    """Manage entity attributes with SCD2."""
    
    def __init__(self, conn: psycopg.Connection):
        """
        Initialize with a database connection.
        
        Args:
            conn: psycopg connection (from pool)
        """
        self.conn = conn
    
    def upsert_attribute(
        self,
        syn_id: str,
        key: str,
        datatype: str,
        value: Union[str, float, dict],
        source: str,
        confidence: float,
        observed_at: Optional[datetime] = None,
        valid_from: Optional[datetime] = None,
    ) -> tuple[bool, bool]:
        """
        Upsert an attribute with SCD2 temporal tracking.
        
        If an active attribute exists with a different value, it will be closed
        and a new attribute created (SCD2 pattern).
        
        NOTE: Does NOT commit. Caller must commit the transaction.
        
        Args:
            syn_id: Entity identifier
            key: Attribute key
            datatype: One of 'STRING', 'NUMBER', 'JSON'
            value: Attribute value (type must match datatype)
            source: Data source identifier
            confidence: Confidence score (0-1)
            observed_at: When the attribute was observed (default: now)
            valid_from: Start of validity (default: observed_at)
            
        Returns:
            Tuple of (inserted, updated) booleans
            
        Raises:
            ValueError: If parameters are invalid
            psycopg.Error: If database operation fails
        """
        # Validate inputs
        if not validate_syn_id(syn_id):
            raise ValueError(f"Invalid syn_id: {syn_id}")
        
        if not key or not key.strip():
            raise ValueError("Attribute key cannot be empty")
        
        if datatype not in ('STRING', 'NUMBER', 'JSON'):
            raise ValueError(f"Invalid datatype: {datatype}")
        
        if not 0 <= confidence <= 1:
            raise ValueError(f"Confidence must be 0-1, got {confidence}")
        
        # Validate value matches datatype
        value_string = None
        value_number = None
        value_json = None
        
        if datatype == 'STRING':
            if not isinstance(value, str):
                raise ValueError(f"Value must be string for datatype STRING, got {type(value)}")
            value_string = value
        elif datatype == 'NUMBER':
            if not isinstance(value, (int, float)):
                raise ValueError(f"Value must be number for datatype NUMBER, got {type(value)}")
            value_number = float(value)
        elif datatype == 'JSON':
            if not isinstance(value, dict):
                raise ValueError(f"Value must be dict for datatype JSON, got {type(value)}")
            value_json = value
        
        if observed_at is None:
            observed_at = datetime.now(timezone.utc)
        
        if valid_from is None:
            valid_from = observed_at
        
        with self.conn.cursor() as cur:
            # Check if active attribute exists
            cur.execute(
                """
                SELECT syn_id, datatype, value_string, value_number, value_json,
                       source, confidence
                FROM attributes
                WHERE syn_id = %s
                  AND key = %s
                  AND valid_to IS NULL
                """,
                (syn_id, key)
            )
            existing = cur.fetchone()
            
            if existing:
                # Check if any significant field changed
                value_changed = (
                    (datatype == 'STRING' and existing['value_string'] != value_string) or
                    (datatype == 'NUMBER' and existing['value_number'] != value_number) or
                    (datatype == 'JSON' and existing['value_json'] != value_json)
                )
                datatype_changed = existing['datatype'] != datatype
                source_changed = existing['source'] != source
                confidence_changed = abs(existing['confidence'] - confidence) > 0.01
                
                if value_changed or datatype_changed or source_changed or confidence_changed:
                    # Close existing attribute (SCD2)
                    cur.execute(
                        """
                        UPDATE attributes
                        SET valid_to = %s, updated_at = NOW()
                        WHERE syn_id = %s
                          AND key = %s
                          AND valid_to IS NULL
                        """,
                        (valid_from, syn_id, key)
                    )
                    
                    # Insert new version
                    cur.execute(
                        """
                        INSERT INTO attributes (
                            syn_id, key, datatype,
                            value_string, value_number, value_json,
                            source, confidence,
                            valid_from, observed_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            syn_id, key, datatype,
                            value_string, value_number, value_json,
                            source, confidence,
                            valid_from, observed_at
                        )
                    )
                    return (False, True)  # Updated
                else:
                    # No change, skip insert
                    return (False, False)  # No-op
            
            # Insert new attribute
            cur.execute(
                """
                INSERT INTO attributes (
                    syn_id, key, datatype,
                    value_string, value_number, value_json,
                    source, confidence,
                    valid_from, observed_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    syn_id, key, datatype,
                    value_string, value_number, value_json,
                    source, confidence,
                    valid_from, observed_at
                )
            )
            return (True, False)  # Inserted
    
    def get_attributes(
        self,
        syn_id: str,
        key: Optional[str] = None,
        active_only: bool = True,
    ) -> list[dict]:
        """
        Get attributes for an entity.
        
        Args:
            syn_id: Entity identifier
            key: Optional filter by key
            active_only: If True, only return active attributes
            
        Returns:
            List of attribute dicts
        """
        if not validate_syn_id(syn_id):
            return []
        
        with self.conn.cursor() as cur:
            if key:
                if active_only:
                    cur.execute(
                        """
                        SELECT key, datatype, value_string, value_number, value_json,
                               source, confidence, valid_from, valid_to, observed_at
                        FROM attributes
                        WHERE syn_id = %s AND key = %s AND valid_to IS NULL
                        """,
                        (syn_id, key)
                    )
                else:
                    cur.execute(
                        """
                        SELECT key, datatype, value_string, value_number, value_json,
                               source, confidence, valid_from, valid_to, observed_at
                        FROM attributes
                        WHERE syn_id = %s AND key = %s
                        ORDER BY valid_from DESC
                        """,
                        (syn_id, key)
                    )
            else:
                if active_only:
                    cur.execute(
                        """
                        SELECT key, datatype, value_string, value_number, value_json,
                               source, confidence, valid_from, valid_to, observed_at
                        FROM attributes
                        WHERE syn_id = %s AND valid_to IS NULL
                        ORDER BY key
                        """,
                        (syn_id,)
                    )
                else:
                    cur.execute(
                        """
                        SELECT key, datatype, value_string, value_number, value_json,
                               source, confidence, valid_from, valid_to, observed_at
                        FROM attributes
                        WHERE syn_id = %s
                        ORDER BY key, valid_from DESC
                        """,
                        (syn_id,)
                    )
            
            return cur.fetchall()

