"""
Redis caching layer for hot entity reads.

Provides sub-millisecond lookups for frequently accessed entities.
"""

import json
import os
import random
from typing import Optional

import redis


class EntityCache:
    """Redis-backed entity cache."""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        """
        Initialize cache with Redis client.
        
        Args:
            redis_client: Optional Redis client (will create default if None)
        """
        if redis_client is None:
            redis_client = self._create_default_client()
        
        self.redis = redis_client
        self.ttl = int(os.getenv('ONTOLOGY_CACHE_TTL', '3600'))  # 1 hour default
        self.key_prefix = 'ontology:entity:'
    
    @staticmethod
    def _create_default_client() -> redis.Redis:
        """Create default Redis client from environment."""
        return redis.Redis(
            host=os.getenv('ONTOLOGY_REDIS_HOST', 'localhost'),
            port=int(os.getenv('ONTOLOGY_REDIS_PORT', '6379')),
            db=int(os.getenv('ONTOLOGY_REDIS_DB', '0')),
            password=os.getenv('ONTOLOGY_REDIS_PASSWORD') or None,
            decode_responses=True,
        )
    
    def _make_key(self, syn_id: str) -> str:
        """Generate cache key for entity."""
        return f"{self.key_prefix}{syn_id}"
    
    def get(self, syn_id: str) -> Optional[dict]:
        """
        Get entity from cache.
        
        Args:
            syn_id: Entity identifier
            
        Returns:
            Entity dict or None if not cached
        """
        try:
            key = self._make_key(syn_id)
            data = self.redis.get(key)
            
            if data is None:
                return None
            
            return json.loads(data)
        
        except (redis.RedisError, json.JSONDecodeError):
            # Cache miss on error
            return None
    
    def set(self, syn_id: str, entity: dict, ttl: Optional[int] = None) -> bool:
        """
        Set entity in cache with TTL jitter to prevent thundering herd.
        
        Args:
            syn_id: Entity identifier
            entity: Entity data to cache
            ttl: Time-to-live in seconds (default: self.ttl with jitter)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            key = self._make_key(syn_id)
            data = json.dumps(entity)
            
            if ttl is None:
                ttl = self.ttl
            
            # Add jitter (0-120s) to prevent cache stampede
            ttl_with_jitter = ttl + random.randint(0, 120)
            
            self.redis.setex(key, ttl_with_jitter, data)
            return True
        
        except (redis.RedisError, TypeError):
            return False
    
    def delete(self, syn_id: str) -> bool:
        """
        Delete entity from cache.
        
        Args:
            syn_id: Entity identifier
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            key = self._make_key(syn_id)
            self.redis.delete(key)
            return True
        
        except redis.RedisError:
            return False
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching pattern.
        
        Args:
            pattern: Redis key pattern (e.g., "ontology:entity:CO_*")
            
        Returns:
            Number of keys deleted
        """
        try:
            keys = self.redis.keys(pattern)
            if keys:
                return self.redis.delete(*keys)
            return 0
        
        except redis.RedisError:
            return 0
    
    def get_stats(self) -> dict:
        """
        Get cache statistics including memory usage.
        
        Returns:
            Dict with cache stats
        """
        try:
            stats_info = self.redis.info('stats')
            memory_info = self.redis.info('memory')
            
            # Count ontology keys
            ontology_keys = len(self.redis.keys(f"{self.key_prefix}*"))
            
            return {
                'total_keys': ontology_keys,
                'hits': stats_info.get('keyspace_hits', 0),
                'misses': stats_info.get('keyspace_misses', 0),
                'hit_rate': self._calculate_hit_rate(
                    stats_info.get('keyspace_hits', 0),
                    stats_info.get('keyspace_misses', 0)
                ),
                'memory_used': memory_info.get('used_memory_human', 'N/A'),
            }
        
        except redis.RedisError:
            return {
                'total_keys': 0,
                'hits': 0,
                'misses': 0,
                'hit_rate': 0.0,
                'memory_used': 'N/A',
            }
    
    @staticmethod
    def _calculate_hit_rate(hits: int, misses: int) -> float:
        """Calculate cache hit rate."""
        total = hits + misses
        if total == 0:
            return 0.0
        return hits / total
    
    def ping(self) -> bool:
        """
        Check if Redis is available.
        
        Returns:
            True if Redis responds, False otherwise
        """
        try:
            return self.redis.ping()
        except redis.RedisError:
            return False

