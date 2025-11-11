"""
Database connection management for the ontology system.

Uses psycopg (v3) with connection pooling for performance.
"""

import os
from contextlib import contextmanager
from typing import Generator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


_pool: Optional[ConnectionPool] = None


def get_db_config() -> dict[str, str]:
    """
    Get database configuration from environment variables.
    
    Returns:
        Dict with connection parameters
    """
    return {
        'host': os.getenv('ONTOLOGY_DB_HOST', 'localhost'),
        'port': os.getenv('ONTOLOGY_DB_PORT', '5432'),
        'dbname': os.getenv('ONTOLOGY_DB_NAME', 'nexus_ontology'),
        'user': os.getenv('ONTOLOGY_DB_USER', 'postgres'),
        'password': os.getenv('ONTOLOGY_DB_PASSWORD', ''),
    }


def get_connection_string() -> str:
    """
    Build PostgreSQL connection string from config.
    
    Returns:
        Connection string in libpq format with statement timeout
    """
    config = get_db_config()
    parts = [f"{k}={v}" for k, v in config.items() if v]
    
    # Add statement timeout for safety (5 seconds default)
    timeout_ms = os.getenv('ONTOLOGY_DB_STATEMENT_TIMEOUT', '5000')
    parts.append(f"options='-c statement_timeout={timeout_ms}'")
    
    return ' '.join(parts)


def get_db_pool(min_size: int = 2, max_size: int = 10) -> ConnectionPool:
    """
    Get or create the connection pool.
    
    Args:
        min_size: Minimum number of connections to maintain (default: 2)
        max_size: Maximum number of connections allowed (default: 10, configurable via env)
        
    Returns:
        Connection pool instance
    """
    global _pool
    
    if _pool is None:
        conninfo = get_connection_string()
        
        # Allow pool size configuration via environment
        min_size = int(os.getenv('ONTOLOGY_DB_POOL_MIN', str(min_size)))
        max_size = int(os.getenv('ONTOLOGY_DB_POOL_MAX', str(max_size)))
        
        _pool = ConnectionPool(
            conninfo=conninfo,
            min_size=min_size,
            max_size=max_size,
            kwargs={'row_factory': dict_row},
        )
    
    return _pool


@contextmanager
def get_db_connection() -> Generator[psycopg.Connection, None, None]:
    """
    Context manager for database connections from the pool.
    
    Yields:
        Database connection with dict_row factory
        
    Example:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM entity_registry LIMIT 1")
                row = cur.fetchone()
    """
    pool = get_db_pool()
    with pool.connection() as conn:
        yield conn


def close_db_pool() -> None:
    """
    Close the connection pool (call on shutdown).
    """
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None

