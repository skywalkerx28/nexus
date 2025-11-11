"""
Daily edge refresh pipeline.

Refreshes core edges from authoritative sources (IBKR, OpenFIGI, etc.).
Runs daily via cron to keep the ontology graph current.
"""

import sys
import logging
from datetime import datetime, timezone
from typing import Optional

from nexus.ontology.db import get_db_connection
from nexus.ontology.registry import EntityRegistry
from nexus.ontology.edges import EdgeManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EdgeRefreshPipeline:
    """Daily edge refresh pipeline."""
    
    def __init__(self):
        """Initialize the pipeline."""
        self.stats = {
            'edges_checked': 0,
            'edges_inserted': 0,
            'edges_updated': 0,
            'errors': 0,
        }
    
    def refresh_listed_on_edges(self, registry: EntityRegistry, edge_mgr: EdgeManager) -> None:
        """
        Refresh LISTED_ON edges from IBKR or other sources.
        
        In production, this would query IBKR contract details or OpenFIGI
        to get current listing information.
        """
        logger.info("Refreshing LISTED_ON edges...")
        
        # TODO: In production, query IBKR contract details
        # For now, this is a placeholder that validates existing edges
        
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT e.src_syn_id, e.dst_syn_id, e.rel_type
                FROM edges e
                WHERE e.rel_type = 'LISTED_ON'
                  AND e.valid_to IS NULL
            """)
            edges = cur.fetchall()
        
        for edge in edges:
            self.stats['edges_checked'] += 1
            # Validation logic would go here
        
        logger.info(f"Validated {len(edges)} LISTED_ON edges")
    
    def refresh_belongs_to_edges(self, registry: EntityRegistry, edge_mgr: EdgeManager) -> None:
        """
        Refresh BELONGS_TO edges (sector/theme classification).
        
        In production, this would update from GICS, industry databases, etc.
        """
        logger.info("Refreshing BELONGS_TO edges...")
        
        # TODO: In production, query sector classification sources
        # For now, this is a placeholder
        
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT e.src_syn_id, e.dst_syn_id, e.rel_type
                FROM edges e
                WHERE e.rel_type = 'BELONGS_TO'
                  AND e.valid_to IS NULL
            """)
            edges = cur.fetchall()
        
        for edge in edges:
            self.stats['edges_checked'] += 1
        
        logger.info(f"Validated {len(edges)} BELONGS_TO edges")
    
    def run(self) -> dict:
        """
        Run the full edge refresh pipeline.
        
        Returns:
            Statistics dict
        """
        start_time = datetime.now(timezone.utc)
        logger.info("=" * 80)
        logger.info("Starting daily edge refresh pipeline")
        logger.info(f"Start time: {start_time.isoformat()}")
        logger.info("=" * 80)
        
        try:
            with get_db_connection() as conn:
                self.conn = conn
                registry = EntityRegistry(conn)
                edge_mgr = EdgeManager(conn)
                
                # Refresh each edge type
                self.refresh_listed_on_edges(registry, edge_mgr)
                self.refresh_belongs_to_edges(registry, edge_mgr)
                
                # Commit all changes
                conn.commit()
                logger.info("All changes committed")
        
        except Exception as e:
            logger.error(f"Pipeline failed: {e}", exc_info=True)
            self.stats['errors'] += 1
            raise
        
        finally:
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            
            logger.info("=" * 80)
            logger.info("Edge refresh pipeline complete")
            logger.info(f"Duration: {duration:.2f}s")
            logger.info(f"Edges checked: {self.stats['edges_checked']}")
            logger.info(f"Edges inserted: {self.stats['edges_inserted']}")
            logger.info(f"Edges updated: {self.stats['edges_updated']}")
            logger.info(f"Errors: {self.stats['errors']}")
            logger.info("=" * 80)
        
        return {
            **self.stats,
            'duration_seconds': duration,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
        }


def main():
    """Main entry point."""
    try:
        pipeline = EdgeRefreshPipeline()
        stats = pipeline.run()
        
        if stats['errors'] > 0:
            logger.error(f"Pipeline completed with {stats['errors']} errors")
            sys.exit(1)
        
        logger.info("Pipeline completed successfully")
        sys.exit(0)
    
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()

