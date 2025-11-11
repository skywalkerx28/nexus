"""
Nexus Ontology API

FastAPI application providing entity resolution, registry access,
and feature queries for the market ontology.
"""

from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from nexus.ontology.db import get_db_connection, close_db_pool
from nexus.ontology.registry import EntityRegistry
from nexus.ontology.edges import EdgeManager
from nexus.ontology.attributes import AttributeManager
from nexus.ontology.nlp_linker import NLPLinker
from nexus.ontology.ulid_gen import EntityType, validate_syn_id
from nexus.ontology.cache import EntityCache


app = FastAPI(
    title="Nexus Ontology API",
    description="Entity resolution and market ontology services",
    version="0.1.0",
)

# Configure CORS for Observatory UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize cache (optional, gracefully degrades if Redis unavailable)
try:
    cache = EntityCache()
    if not cache.ping():
        print("Warning: Redis unavailable, caching disabled")
        cache = None
except Exception as e:
    print(f"Warning: Failed to initialize cache: {e}")
    cache = None


class EntityCreate(BaseModel):
    """Request model for creating entities."""
    entity_type: EntityType
    canonical_name: str = Field(..., min_length=1, max_length=500)
    status: str = Field(default='ACTIVE', pattern='^(ACTIVE|INACTIVE|MERGED)$')


class IdentifierAdd(BaseModel):
    """Request model for adding identifiers."""
    syn_id: str = Field(..., min_length=1, max_length=30)
    scheme: str = Field(..., min_length=1, max_length=30)
    value: str = Field(..., min_length=1, max_length=500)
    valid_from: Optional[datetime] = None


class AliasAdd(BaseModel):
    """Request model for adding aliases."""
    syn_id: str = Field(..., min_length=1, max_length=30)
    alias: str = Field(..., min_length=1, max_length=500)
    lang: Optional[str] = Field(None, max_length=10)
    source: Optional[str] = Field(None, max_length=50)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class EdgeAdd(BaseModel):
    """Request model for adding edges."""
    src_syn_id: str = Field(..., min_length=1, max_length=30)
    dst_syn_id: str = Field(..., min_length=1, max_length=30)
    rel_type: str = Field(..., min_length=1, max_length=30)
    source: str = Field(..., min_length=1, max_length=50)
    confidence: float = Field(..., ge=0.0, le=1.0)
    attrs: Optional[dict] = None
    evidence: Optional[str] = None
    observed_at: Optional[datetime] = None


class EdgeBatchAdd(BaseModel):
    """Request model for batch adding edges."""
    edges: list[EdgeAdd] = Field(..., min_items=1, max_items=1000)


class AttributeUpsert(BaseModel):
    """Request model for upserting attributes."""
    syn_id: str = Field(..., min_length=1, max_length=30)
    key: str = Field(..., min_length=1, max_length=100)
    datatype: str = Field(..., pattern='^(STRING|NUMBER|JSON)$')
    value_string: Optional[str] = None
    value_number: Optional[float] = None
    value_json: Optional[dict] = None
    source: str = Field(..., min_length=1, max_length=50)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    observed_at: Optional[datetime] = None


class AttributeBatchUpsert(BaseModel):
    """Request model for batch upserting attributes."""
    attributes: list[AttributeUpsert] = Field(..., min_items=1, max_items=1000)


@app.on_event("shutdown")
async def shutdown_event():
    """Close database pool on shutdown."""
    close_db_pool()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "healthy", "service": "ontology_api"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


@app.get("/resolve")
async def resolve_identifier(
    scheme: str = Query(..., description="Identifier scheme (TICKER, FIGI, etc.)"),
    value: str = Query(..., description="Identifier value"),
    asof: Optional[datetime] = Query(None, description="Point-in-time for resolution"),
):
    """
    Resolve an external identifier to a syn_id.
    
    Returns entity details if found, 404 if not found.
    """
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            result = registry.resolve_identifier(scheme, value, asof)
        
        if result is None:
            raise HTTPException(
                status_code=404,
                detail=f"No entity found for {scheme}:{value}"
            )
        
        return {
            "syn_id": result['syn_id'],
            "canonical_name": result['canonical_name'],
            "type": result['type'],
            "status": result['status'],
            "confidence": 1.0,
            "matched_via": scheme,
            "valid_from": result['valid_from'].isoformat(),
            "valid_to": result['valid_to'].isoformat() if result['valid_to'] else None,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities/{syn_id}")
async def get_entity(
    syn_id: str,
    include_identifiers: bool = Query(True, description="Include identifier mappings"),
    include_aliases: bool = Query(True, description="Include aliases"),
):
    """
    Get entity details by syn_id.
    
    Returns full entity with identifiers and aliases if requested.
    Uses Redis cache for hot reads.
    """
    if not validate_syn_id(syn_id):
        raise HTTPException(status_code=400, detail=f"Invalid syn_id format: {syn_id}")
    
    # Try cache first
    cache_key = f"{syn_id}:{include_identifiers}:{include_aliases}"
    if cache is not None:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            entity = registry.get_entity(syn_id)
            
            if entity is None:
                raise HTTPException(status_code=404, detail=f"Entity not found: {syn_id}")
            
            response = {
                "syn_id": entity['syn_id'],
                "type": entity['type'],
                "canonical_name": entity['canonical_name'],
                "status": entity['status'],
                "replaces_syn_id": entity['replaces_syn_id'] or [],
                "created_at": entity['created_at'].isoformat(),
                "updated_at": entity['updated_at'].isoformat(),
            }
            
            if include_identifiers:
                identifiers = registry.get_identifiers(syn_id, active_only=True)
                response['identifiers'] = [
                    {
                        "scheme": i['scheme'],
                        "value": i['value'],
                        "valid_from": i['valid_from'].isoformat(),
                        "valid_to": i['valid_to'].isoformat() if i['valid_to'] else None,
                    }
                    for i in identifiers
                ]
            
            if include_aliases:
                aliases = registry.get_aliases(syn_id)
                response['aliases'] = [
                    {
                        "alias": a['alias'],
                        "lang": a['lang'],
                        "source": a['source'],
                        "confidence": a['confidence'],
                    }
                    for a in aliases
                ]
            
            # Cache the response
            if cache is not None:
                cache.set(cache_key, response)
            
            return response
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/entities")
async def create_entity(entity: EntityCreate):
    """
    Create a new entity in the registry.
    
    Returns the generated syn_id.
    """
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            syn_id = registry.create_entity(
                entity_type=entity.entity_type,
                canonical_name=entity.canonical_name,
                status=entity.status,
            )
        
        return {
            "syn_id": syn_id,
            "type": entity.entity_type,
            "canonical_name": entity.canonical_name,
            "status": entity.status,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/identifiers")
async def add_identifier(identifier: IdentifierAdd):
    """
    Add an identifier mapping to an entity.
    
    Uses SCD2 for temporal validity tracking.
    """
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            registry.add_identifier(
                syn_id=identifier.syn_id,
                scheme=identifier.scheme,
                value=identifier.value,
                valid_from=identifier.valid_from,
            )
        
        return {
            "status": "success",
            "syn_id": identifier.syn_id,
            "scheme": identifier.scheme,
            "value": identifier.value,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/aliases")
async def add_alias(alias: AliasAdd):
    """
    Add an alias (alternative name) to an entity.
    """
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            registry.add_alias(
                syn_id=alias.syn_id,
                alias=alias.alias,
                lang=alias.lang,
                source=alias.source,
                confidence=alias.confidence,
            )
        
        return {
            "status": "success",
            "syn_id": alias.syn_id,
            "alias": alias.alias,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
async def search_entities(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(10, ge=1, le=100, description="Maximum results"),
):
    """
    Search entities by name (full-text search).
    """
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            results = registry.search_by_name(q, limit=limit)
        
        return {
            "query": q,
            "count": len(results),
            "results": [
                {
                    "syn_id": r['syn_id'],
                    "type": r['type'],
                    "canonical_name": r['canonical_name'],
                    "status": r['status'],
                    "relevance": float(r['rank']),
                }
                for r in results
            ]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities/{syn_id}/edges")
async def get_entity_edges(
    syn_id: str,
    direction: str = Query('out', pattern='^(out|in|both)$', description="Edge direction"),
    rel_type: Optional[str] = Query(None, description="Filter by relationship type"),
    active_only: bool = Query(True, description="Only return active edges"),
    asof: Optional[datetime] = Query(None, description="Point-in-time for historical queries"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Results to skip"),
):
    """
    Get edges for an entity with pagination and temporal queries.
    
    Returns relationships with related entity details.
    """
    if not validate_syn_id(syn_id):
        raise HTTPException(status_code=400, detail=f"Invalid syn_id format: {syn_id}")
    
    try:
        with get_db_connection() as conn:
            edge_mgr = EdgeManager(conn)
            edges = edge_mgr.get_edges(
                syn_id=syn_id,
                direction=direction,
                rel_type=rel_type,
                active_only=active_only,
                asof=asof,
                limit=limit,
                offset=offset,
            )
        
        return {
            "syn_id": syn_id,
            "direction": direction,
            "count": len(edges),
            "edges": [
                {
                    "src_syn_id": e['src_syn_id'],
                    "dst_syn_id": e['dst_syn_id'],
                    "rel_type": e['rel_type'],
                    "attrs": e['attrs'],
                    "source": e['source'],
                    "evidence": e['evidence'],
                    "confidence": e['confidence'],
                    "valid_from": e['valid_from'].isoformat(),
                    "valid_to": e['valid_to'].isoformat() if e['valid_to'] else None,
                    "observed_at": e['observed_at'].isoformat(),
                    "related_syn_id": e.get('related_syn_id'),
                    "related_name": e.get('related_name'),
                    "related_type": e.get('related_type'),
                }
                for e in edges
            ]
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/edges")
async def add_edge(edge: EdgeAdd):
    """
    Add a single edge (relationship) between entities.
    
    Uses SCD2: if edge exists with different attributes, closes old and creates new.
    """
    try:
        with get_db_connection() as conn:
            edge_mgr = EdgeManager(conn)
            inserted, updated = edge_mgr.add_edge(
                src_syn_id=edge.src_syn_id,
                dst_syn_id=edge.dst_syn_id,
                rel_type=edge.rel_type,
                source=edge.source,
                confidence=edge.confidence,
                attrs=edge.attrs,
                evidence=edge.evidence,
                observed_at=edge.observed_at,
            )
            conn.commit()
        
        # Invalidate cache for both entities (all variants)
        if cache is not None:
            cache.invalidate_pattern(f"ontology:entity:{edge.src_syn_id}:*")
            cache.invalidate_pattern(f"ontology:entity:{edge.dst_syn_id}:*")
        
        return {
            "status": "success",
            "inserted": inserted,
            "updated": updated,
            "src_syn_id": edge.src_syn_id,
            "dst_syn_id": edge.dst_syn_id,
            "rel_type": edge.rel_type,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/edges/batch")
async def add_edges_batch(batch: EdgeBatchAdd):
    """
    Batch add edges (up to 1,000 per request).
    
    Atomic transaction: all edges succeed or all fail (rollback on any error).
    """
    try:
        inserted = 0
        updated = 0
        errors = []
        
        with get_db_connection() as conn:
            try:
                edge_mgr = EdgeManager(conn)
                
                for idx, edge in enumerate(batch.edges):
                    try:
                        ins, upd = edge_mgr.add_edge(
                            src_syn_id=edge.src_syn_id,
                            dst_syn_id=edge.dst_syn_id,
                            rel_type=edge.rel_type,
                            source=edge.source,
                            confidence=edge.confidence,
                            attrs=edge.attrs,
                            evidence=edge.evidence,
                            observed_at=edge.observed_at,
                        )
                        
                        if ins:
                            inserted += 1
                        elif upd:
                            updated += 1
                    
                    except Exception as e:
                        errors.append({
                            "index": idx,
                            "edge": {
                                "src": edge.src_syn_id,
                                "dst": edge.dst_syn_id,
                                "rel_type": edge.rel_type,
                            },
                            "error": str(e),
                        })
                
                # Atomic semantics: rollback if any errors
                if errors:
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "message": "Batch failed, transaction rolled back",
                            "errors": errors,
                            "attempted": len(batch.edges),
                        }
                    )
                
                # Single commit for entire batch
                conn.commit()
            
            except HTTPException:
                raise
            except Exception as e:
                # Rollback on any error
                conn.rollback()
                raise
        
        # Invalidate cache for affected entities (all variants)
        if cache is not None:
            affected_ids = set()
            for edge in batch.edges:
                affected_ids.add(edge.src_syn_id)
                affected_ids.add(edge.dst_syn_id)
            for syn_id in affected_ids:
                cache.invalidate_pattern(f"ontology:entity:{syn_id}:*")
        
        return {
            "inserted": inserted,
            "updated": updated,
            "errors": errors,
            "total_processed": len(batch.edges),
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/edges")
async def delete_edge(
    src_syn_id: str = Query(..., description="Source entity ID"),
    dst_syn_id: str = Query(..., description="Destination entity ID"),
    rel_type: str = Query(..., description="Relationship type"),
):
    """
    Close an active edge (SCD2 soft delete).
    """
    try:
        with get_db_connection() as conn:
            edge_mgr = EdgeManager(conn)
            deleted = edge_mgr.delete_edge(src_syn_id, dst_syn_id, rel_type)
            
            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail=f"No active edge found: {src_syn_id} -> {dst_syn_id} ({rel_type})"
                )
            
            conn.commit()
        
        # Invalidate cache (all variants)
        if cache is not None:
            cache.invalidate_pattern(f"ontology:entity:{src_syn_id}:*")
            cache.invalidate_pattern(f"ontology:entity:{dst_syn_id}:*")
        
        return {
            "status": "success",
            "message": "Edge closed",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/attributes")
async def upsert_attribute(attr: AttributeUpsert):
    """
    Upsert a single attribute with SCD2 temporal tracking.
    """
    try:
        # Validate exactly one value field is populated
        value_count = sum([
            attr.value_string is not None,
            attr.value_number is not None,
            attr.value_json is not None,
        ])
        
        if value_count != 1:
            raise ValueError("Exactly one of value_string, value_number, value_json must be set")
        
        # Get the actual value
        if attr.datatype == 'STRING':
            value = attr.value_string
        elif attr.datatype == 'NUMBER':
            value = attr.value_number
        else:  # JSON
            value = attr.value_json
        
        with get_db_connection() as conn:
            attr_mgr = AttributeManager(conn)
            inserted, updated = attr_mgr.upsert_attribute(
                syn_id=attr.syn_id,
                key=attr.key,
                datatype=attr.datatype,
                value=value,
                source=attr.source,
                confidence=attr.confidence,
                observed_at=attr.observed_at,
            )
            conn.commit()
        
        # Invalidate cache
        if cache is not None:
            cache.invalidate_pattern(f"ontology:entity:{attr.syn_id}:*")
        
        return {
            "status": "success",
            "inserted": inserted,
            "updated": updated,
            "syn_id": attr.syn_id,
            "key": attr.key,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/attributes/batch")
async def upsert_attributes_batch(batch: AttributeBatchUpsert):
    """
    Batch upsert attributes (up to 1,000 per request).
    
    Atomic transaction: all attributes succeed or all fail (rollback on any error).
    """
    try:
        inserted = 0
        updated = 0
        errors = []
        
        with get_db_connection() as conn:
            try:
                attr_mgr = AttributeManager(conn)
                
                for idx, attr in enumerate(batch.attributes):
                    try:
                        # Validate exactly one value field
                        value_count = sum([
                            attr.value_string is not None,
                            attr.value_number is not None,
                            attr.value_json is not None,
                        ])
                        
                        if value_count != 1:
                            raise ValueError("Exactly one value field must be set")
                        
                        # Get the actual value
                        if attr.datatype == 'STRING':
                            value = attr.value_string
                        elif attr.datatype == 'NUMBER':
                            value = attr.value_number
                        else:  # JSON
                            value = attr.value_json
                        
                        ins, upd = attr_mgr.upsert_attribute(
                            syn_id=attr.syn_id,
                            key=attr.key,
                            datatype=attr.datatype,
                            value=value,
                            source=attr.source,
                            confidence=attr.confidence,
                            observed_at=attr.observed_at,
                        )
                        
                        if ins:
                            inserted += 1
                        elif upd:
                            updated += 1
                    
                    except Exception as e:
                        errors.append({
                            "index": idx,
                            "attribute": {
                                "syn_id": attr.syn_id,
                                "key": attr.key,
                            },
                            "error": str(e),
                        })
                
                # Atomic semantics: rollback if any errors
                if errors:
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "message": "Batch failed, transaction rolled back",
                            "errors": errors,
                            "attempted": len(batch.attributes),
                        }
                    )
                
                # Single commit for entire batch
                conn.commit()
            
            except HTTPException:
                raise
            except Exception as e:
                conn.rollback()
                raise
        
        # Invalidate cache for affected entities
        if cache is not None:
            affected_ids = {attr.syn_id for attr in batch.attributes}
            for syn_id in affected_ids:
                cache.invalidate_pattern(f"ontology:entity:{syn_id}:*")
        
        return {
            "inserted": inserted,
            "updated": updated,
            "errors": errors,
            "total_processed": len(batch.attributes),
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/link")
async def link_entity(
    text: str = Query(..., min_length=1, description="Text to resolve"),
    entity_type: Optional[str] = Query(None, description="Optional entity type filter"),
    context: Optional[dict] = None,
):
    """
    Link text mention to entity (NLP entity linking).
    
    Returns syn_id if confidence >= threshold, otherwise quarantines.
    """
    try:
        with get_db_connection() as conn:
            linker = NLPLinker(conn)
            syn_id, quarantine_id = linker.resolve_or_quarantine(
                text=text,
                context=context,
                entity_type_filter=entity_type,
            )
        
        if syn_id:
            return {
                "status": "resolved",
                "syn_id": syn_id,
                "text": text,
            }
        else:
            return {
                "status": "quarantined",
                "quarantine_id": quarantine_id,
                "text": text,
                "message": "Entity could not be resolved with high confidence",
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/quarantine")
async def get_quarantine(
    resolved: bool = Query(False, description="Get resolved items"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Results to skip"),
):
    """
    Get quarantine items (unresolved entities).
    """
    try:
        with get_db_connection() as conn:
            linker = NLPLinker(conn)
            items, total = linker.get_quarantine_items(
                resolved=resolved,
                limit=limit,
                offset=offset,
            )
        
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class QuarantineResolve(BaseModel):
    """Request model for resolving quarantine items."""
    syn_id: str = Field(..., min_length=1, max_length=30)
    resolved_by: str = Field(..., min_length=1, max_length=100)


@app.post("/quarantine/{quarantine_id}/resolve")
async def resolve_quarantine(quarantine_id: int, resolve: QuarantineResolve):
    """
    Manually resolve a quarantine item.
    """
    try:
        with get_db_connection() as conn:
            linker = NLPLinker(conn)
            success = linker.resolve_quarantine_item(
                quarantine_id=quarantine_id,
                syn_id=resolve.syn_id,
                resolved_by=resolve.resolved_by,
            )
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Quarantine item {quarantine_id} not found or already resolved"
            )
        
        return {
            "status": "success",
            "quarantine_id": quarantine_id,
            "syn_id": resolve.syn_id,
        }
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """
    Get ontology statistics including edges and cache performance.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM ontology_stats")
                stats = cur.fetchone()
            
            # Add edge stats
            edge_mgr = EdgeManager(conn)
            edge_stats = edge_mgr.get_edge_stats()
            stats['edges'] = edge_stats
        
        # Add cache stats if available
        if cache is not None:
            stats['cache'] = cache.get_stats()
        else:
            stats['cache'] = {'status': 'disabled'}
        
        return stats
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

