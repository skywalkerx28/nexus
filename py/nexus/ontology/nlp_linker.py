"""
NLP Entity Linker - Rule-Based (Phase 1)

Resolves text mentions (tickers, company names, executive names) to syn_ids
using rule-based candidate generation and strict confidence thresholds.

Phase 1: Exact/fuzzy matching on tickers, aliases, and identifiers.
Phase 2 (future): Cross-encoder reranking for improved recall.
"""

import re
from datetime import datetime, timezone
from typing import Optional
from difflib import SequenceMatcher

import psycopg

from .ulid_gen import validate_syn_id


class Candidate:
    """Entity resolution candidate with confidence score."""
    
    def __init__(
        self,
        syn_id: str,
        canonical_name: str,
        entity_type: str,
        matched_via: str,
        matched_value: str,
        confidence: float,
        source: str = 'nlp_linker',
    ):
        """
        Initialize a candidate.
        
        Args:
            syn_id: Entity identifier
            canonical_name: Entity name
            entity_type: Entity type
            matched_via: How the match was found (TICKER, ALIAS, etc.)
            matched_value: The value that matched
            confidence: Confidence score (0-1)
            source: Source identifier
        """
        self.syn_id = syn_id
        self.canonical_name = canonical_name
        self.entity_type = entity_type
        self.matched_via = matched_via
        self.matched_value = matched_value
        self.confidence = confidence
        self.source = source
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            'syn_id': self.syn_id,
            'canonical_name': self.canonical_name,
            'entity_type': self.entity_type,
            'matched_via': self.matched_via,
            'matched_value': self.matched_value,
            'confidence': self.confidence,
            'source': self.source,
        }


class NLPLinker:
    """
    Rule-based entity linker.
    
    Resolves text mentions to syn_ids using:
    1. Exact ticker match (confidence: 1.0)
    2. Exact identifier match (confidence: 1.0)
    3. Exact alias match (confidence: 0.95)
    4. Fuzzy alias match (confidence: 0.70-0.90)
    5. Canonical name match (confidence: 0.80-0.95)
    """
    
    # Confidence thresholds
    CONFIDENCE_EXACT_TICKER = 1.0
    CONFIDENCE_EXACT_IDENTIFIER = 1.0
    CONFIDENCE_EXACT_ALIAS = 0.95
    CONFIDENCE_FUZZY_HIGH = 0.90
    CONFIDENCE_FUZZY_MEDIUM = 0.80
    CONFIDENCE_FUZZY_LOW = 0.70
    CONFIDENCE_CANONICAL = 0.85
    
    # Operating threshold (auto-attach vs quarantine)
    CONFIDENCE_THRESHOLD = 0.95
    
    def __init__(self, conn: psycopg.Connection):
        """
        Initialize with a database connection.
        
        Args:
            conn: psycopg connection (from pool)
        """
        self.conn = conn
    
    def _normalize_text(self, text: str) -> str:
        """
        Normalize text for matching.
        
        Args:
            text: Input text
            
        Returns:
            Normalized text (lowercase, stripped, no extra whitespace)
        """
        if not text:
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Strip
        text = text.strip()
        
        return text
    
    def _is_ticker_like(self, text: str) -> bool:
        """
        Check if text looks like a ticker symbol.
        
        Args:
            text: Input text
            
        Returns:
            True if ticker-like
        """
        # Tickers are typically 1-5 uppercase letters, sometimes with dots
        if not text:
            return False
        
        # Check length
        if len(text) < 1 or len(text) > 6:
            return False
        
        # Check pattern
        return bool(re.match(r'^[A-Z]{1,5}(\.[A-Z])?$', text))
    
    def _find_ticker_candidates(self, text: str) -> list[Candidate]:
        """
        Find candidates by exact ticker match.
        
        Args:
            text: Ticker symbol (e.g., "AAPL", "BRK.B")
            
        Returns:
            List of candidates
        """
        candidates = []
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT
                    i.syn_id,
                    e.canonical_name,
                    e.type,
                    i.value
                FROM identifiers i
                JOIN entity_registry e ON i.syn_id = e.syn_id
                WHERE i.scheme = 'TICKER'
                  AND UPPER(i.value) = UPPER(%s)
                  AND i.valid_to IS NULL
                  AND e.status = 'ACTIVE'
                """,
                (text,)
            )
            
            for row in cur.fetchall():
                candidates.append(Candidate(
                    syn_id=row['syn_id'],
                    canonical_name=row['canonical_name'],
                    entity_type=row['type'],
                    matched_via='TICKER',
                    matched_value=row['value'],
                    confidence=self.CONFIDENCE_EXACT_TICKER,
                ))
        
        return candidates
    
    def _find_identifier_candidates(self, scheme: str, value: str) -> list[Candidate]:
        """
        Find candidates by exact identifier match.
        
        Args:
            scheme: Identifier scheme (FIGI, ISIN, etc.)
            value: Identifier value
            
        Returns:
            List of candidates
        """
        candidates = []
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT
                    i.syn_id,
                    e.canonical_name,
                    e.type,
                    i.value
                FROM identifiers i
                JOIN entity_registry e ON i.syn_id = e.syn_id
                WHERE i.scheme = %s
                  AND i.value = %s
                  AND i.valid_to IS NULL
                  AND e.status = 'ACTIVE'
                """,
                (scheme, value)
            )
            
            for row in cur.fetchall():
                candidates.append(Candidate(
                    syn_id=row['syn_id'],
                    canonical_name=row['canonical_name'],
                    entity_type=row['type'],
                    matched_via=scheme,
                    matched_value=row['value'],
                    confidence=self.CONFIDENCE_EXACT_IDENTIFIER,
                ))
        
        return candidates
    
    def _find_alias_candidates(self, text: str, exact: bool = True) -> list[Candidate]:
        """
        Find candidates by alias match.
        
        Args:
            text: Text to match
            exact: If True, exact match; if False, fuzzy match
            
        Returns:
            List of candidates
        """
        candidates = []
        normalized = self._normalize_text(text)
        
        with self.conn.cursor() as cur:
            if exact:
                # Exact match (case-insensitive)
                cur.execute(
                    """
                    SELECT DISTINCT
                        a.syn_id,
                        e.canonical_name,
                        e.type,
                        a.alias,
                        a.confidence as alias_confidence
                    FROM aliases a
                    JOIN entity_registry e ON a.syn_id = e.syn_id
                    WHERE LOWER(a.alias) = %s
                      AND e.status = 'ACTIVE'
                    ORDER BY a.confidence DESC
                    LIMIT 10
                    """,
                    (normalized,)
                )
                
                for row in cur.fetchall():
                    # Use minimum of alias confidence and exact match confidence
                    confidence = min(
                        row['alias_confidence'] or 1.0,
                        self.CONFIDENCE_EXACT_ALIAS
                    )
                    
                    candidates.append(Candidate(
                        syn_id=row['syn_id'],
                        canonical_name=row['canonical_name'],
                        entity_type=row['type'],
                        matched_via='ALIAS',
                        matched_value=row['alias'],
                        confidence=confidence,
                    ))
            
            else:
                # Fuzzy match using trigram similarity
                cur.execute(
                    """
                    SELECT DISTINCT
                        a.syn_id,
                        e.canonical_name,
                        e.type,
                        a.alias,
                        a.confidence as alias_confidence,
                        similarity(LOWER(a.alias), %s) as sim_score
                    FROM aliases a
                    JOIN entity_registry e ON a.syn_id = e.syn_id
                    WHERE LOWER(a.alias) %% %s
                      AND e.status = 'ACTIVE'
                    ORDER BY sim_score DESC, a.confidence DESC
                    LIMIT 10
                    """,
                    (normalized, normalized)
                )
                
                for row in cur.fetchall():
                    # Fuzzy confidence based on similarity score
                    sim_score = row['sim_score']
                    if sim_score >= 0.9:
                        confidence = self.CONFIDENCE_FUZZY_HIGH
                    elif sim_score >= 0.8:
                        confidence = self.CONFIDENCE_FUZZY_MEDIUM
                    else:
                        confidence = self.CONFIDENCE_FUZZY_LOW
                    
                    # Adjust by alias confidence
                    confidence = min(confidence, row['alias_confidence'] or 1.0)
                    
                    candidates.append(Candidate(
                        syn_id=row['syn_id'],
                        canonical_name=row['canonical_name'],
                        entity_type=row['type'],
                        matched_via='ALIAS_FUZZY',
                        matched_value=row['alias'],
                        confidence=confidence,
                    ))
        
        return candidates
    
    def _find_canonical_name_candidates(self, text: str) -> list[Candidate]:
        """
        Find candidates by canonical name match.
        
        Args:
            text: Text to match
            
        Returns:
            List of candidates
        """
        candidates = []
        normalized = self._normalize_text(text)
        
        with self.conn.cursor() as cur:
            # Full-text search on canonical name
            cur.execute(
                """
                SELECT 
                    syn_id,
                    type,
                    canonical_name,
                    ts_rank(
                        to_tsvector('english', canonical_name),
                        plainto_tsquery('english', %s)
                    ) as rank
                FROM entity_registry
                WHERE status = 'ACTIVE'
                  AND to_tsvector('english', canonical_name) @@ plainto_tsquery('english', %s)
                ORDER BY rank DESC
                LIMIT 10
                """,
                (text, text)
            )
            
            for row in cur.fetchall():
                # Calculate confidence based on similarity
                similarity = SequenceMatcher(
                    None,
                    normalized,
                    self._normalize_text(row['canonical_name'])
                ).ratio()
                
                confidence = self.CONFIDENCE_CANONICAL * similarity
                
                candidates.append(Candidate(
                    syn_id=row['syn_id'],
                    canonical_name=row['canonical_name'],
                    entity_type=row['type'],
                    matched_via='CANONICAL_NAME',
                    matched_value=row['canonical_name'],
                    confidence=confidence,
                ))
        
        return candidates
    
    def resolve(
        self,
        text: str,
        context: Optional[dict] = None,
        entity_type_filter: Optional[str] = None,
    ) -> tuple[Optional[Candidate], list[Candidate]]:
        """
        Resolve a text mention to a syn_id.
        
        Uses cascading strategy:
        1. Try exact ticker match (if ticker-like)
        2. Try exact alias match
        3. Try fuzzy alias match
        4. Try canonical name match
        
        Args:
            text: Text to resolve (e.g., "AAPL", "Apple Inc.", "Apple")
            context: Optional context dict (for quarantine logging)
            entity_type_filter: Optional entity type filter
            
        Returns:
            Tuple of (best_candidate, all_candidates)
            - best_candidate is None if confidence < threshold
            - all_candidates sorted by confidence descending
        """
        if not text or not text.strip():
            return None, []
        
        text = text.strip()
        all_candidates = []
        
        # Strategy 1: Exact ticker match (if ticker-like)
        if self._is_ticker_like(text):
            candidates = self._find_ticker_candidates(text)
            all_candidates.extend(candidates)
        
        # Strategy 2: Exact alias match
        if not all_candidates:
            candidates = self._find_alias_candidates(text, exact=True)
            all_candidates.extend(candidates)
        
        # Strategy 3: Canonical name match
        if not all_candidates:
            candidates = self._find_canonical_name_candidates(text)
            all_candidates.extend(candidates)
        
        # Strategy 4: Fuzzy alias match (fallback)
        if not all_candidates:
            candidates = self._find_alias_candidates(text, exact=False)
            all_candidates.extend(candidates)
        
        # Filter by entity type if specified
        if entity_type_filter:
            all_candidates = [
                c for c in all_candidates
                if c.entity_type == entity_type_filter
            ]
        
        # Deduplicate by syn_id (keep highest confidence)
        seen = {}
        for candidate in all_candidates:
            if candidate.syn_id not in seen or candidate.confidence > seen[candidate.syn_id].confidence:
                seen[candidate.syn_id] = candidate
        
        all_candidates = list(seen.values())
        
        # Sort by confidence descending
        all_candidates.sort(key=lambda c: c.confidence, reverse=True)
        
        # Return best candidate if above threshold
        if all_candidates and all_candidates[0].confidence >= self.CONFIDENCE_THRESHOLD:
            return all_candidates[0], all_candidates
        
        # Below threshold: quarantine
        return None, all_candidates
    
    def quarantine(
        self,
        raw_identifier: str,
        scheme: Optional[str],
        context: Optional[dict],
        reason: str,
        candidates: Optional[list[Candidate]] = None,
    ) -> int:
        """
        Add an unresolved entity to quarantine.
        
        Args:
            raw_identifier: The text that couldn't be resolved
            scheme: Optional identifier scheme
            context: Optional context dict
            reason: Reason for quarantine
            candidates: Optional list of candidates (for ambiguity cases)
            
        Returns:
            Quarantine record ID
        """
        # Add candidates to context if provided
        if candidates:
            if context is None:
                context = {}
            context['candidates'] = [c.to_dict() for c in candidates]
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO entity_quarantine (
                    raw_identifier, scheme, context, reason
                )
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (raw_identifier, scheme, context, reason)
            )
            result = cur.fetchone()
        
        self.conn.commit()
        return result['id']
    
    def resolve_or_quarantine(
        self,
        text: str,
        context: Optional[dict] = None,
        entity_type_filter: Optional[str] = None,
    ) -> tuple[Optional[str], Optional[int]]:
        """
        Resolve text to syn_id or quarantine if ambiguous.
        
        Args:
            text: Text to resolve
            context: Optional context
            entity_type_filter: Optional entity type filter
            
        Returns:
            Tuple of (syn_id, quarantine_id)
            - If resolved: (syn_id, None)
            - If quarantined: (None, quarantine_id)
        """
        best, all_candidates = self.resolve(text, context, entity_type_filter)
        
        if best:
            # Resolved with high confidence
            return best.syn_id, None
        
        # Quarantine
        if not all_candidates:
            reason = "No candidates found"
        elif len(all_candidates) > 1 and all_candidates[0].confidence - all_candidates[1].confidence < 0.1:
            reason = f"Ambiguous: {len(all_candidates)} candidates with similar confidence"
        else:
            reason = f"Low confidence: best={all_candidates[0].confidence:.2f} < threshold={self.CONFIDENCE_THRESHOLD}"
        
        quarantine_id = self.quarantine(
            raw_identifier=text,
            scheme=None,
            context=context,
            reason=reason,
            candidates=all_candidates,
        )
        
        return None, quarantine_id
    
    def get_quarantine_items(
        self,
        resolved: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """
        Get quarantine items.
        
        Args:
            resolved: If True, get resolved items; if False, get unresolved
            limit: Maximum results
            offset: Results to skip
            
        Returns:
            Tuple of (items, total_count)
        """
        with self.conn.cursor() as cur:
            # Get total count
            if resolved:
                cur.execute(
                    "SELECT COUNT(*) as count FROM entity_quarantine WHERE resolved_syn_id IS NOT NULL"
                )
            else:
                cur.execute(
                    "SELECT COUNT(*) as count FROM entity_quarantine WHERE resolved_syn_id IS NULL"
                )
            
            total = cur.fetchone()['count']
            
            # Get items
            if resolved:
                cur.execute(
                    """
                    SELECT id, raw_identifier, scheme, context, reason,
                           ingested_at, resolved_syn_id, resolved_at, resolved_by
                    FROM entity_quarantine
                    WHERE resolved_syn_id IS NOT NULL
                    ORDER BY resolved_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset)
                )
            else:
                cur.execute(
                    """
                    SELECT id, raw_identifier, scheme, context, reason, ingested_at
                    FROM entity_quarantine
                    WHERE resolved_syn_id IS NULL
                    ORDER BY ingested_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset)
                )
            
            items = cur.fetchall()
        
        return items, total
    
    def resolve_quarantine_item(
        self,
        quarantine_id: int,
        syn_id: str,
        resolved_by: str,
    ) -> bool:
        """
        Resolve a quarantine item by assigning it to a syn_id.
        
        Args:
            quarantine_id: Quarantine record ID
            syn_id: Entity identifier to assign
            resolved_by: Who resolved it (user email, etc.)
            
        Returns:
            True if successful, False if not found
        """
        if not validate_syn_id(syn_id):
            raise ValueError(f"Invalid syn_id: {syn_id}")
        
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE entity_quarantine
                SET resolved_syn_id = %s,
                    resolved_at = NOW(),
                    resolved_by = %s
                WHERE id = %s
                  AND resolved_syn_id IS NULL
                RETURNING id
                """,
                (syn_id, resolved_by, quarantine_id)
            )
            result = cur.fetchone()
        
        self.conn.commit()
        return result is not None

