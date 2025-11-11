"""
Seed example edges for the ontology.

Creates relationships between seeded entities (companies, exchanges, commodities).
"""

import sys
from pathlib import Path

from nexus.ontology.db import get_db_connection
from nexus.ontology.registry import EntityRegistry
from nexus.ontology.edges import EdgeManager


def seed_company_exchange_edges(registry: EntityRegistry, edge_mgr: EdgeManager) -> int:
    """
    Create LISTED_ON edges between companies and exchanges.
    
    Returns:
        Number of edges created
    """
    count = 0
    
    # Map tickers to exchanges
    listings = [
        ('AAPL', 'XNAS'),  # Apple on NASDAQ
        ('MSFT', 'XNAS'),  # Microsoft on NASDAQ
        ('GOOGL', 'XNAS'), # Alphabet on NASDAQ
        ('AMZN', 'XNAS'),  # Amazon on NASDAQ
        ('NVDA', 'XNAS'),  # NVIDIA on NASDAQ
        ('TSLA', 'XNAS'),  # Tesla on NASDAQ
        ('META', 'XNAS'),  # Meta on NASDAQ
        ('JPM', 'XNYS'),   # JPMorgan on NYSE
        ('V', 'XNYS'),     # Visa on NYSE
        ('WMT', 'XNYS'),   # Walmart on NYSE
    ]
    
    for ticker, mic in listings:
        try:
            # Resolve company by ticker
            company = registry.resolve_identifier('TICKER', ticker)
            if not company:
                print(f"Warning: Company not found for ticker {ticker}")
                continue
            
            # Resolve exchange by MIC
            exchange = registry.resolve_identifier('MIC', mic)
            if not exchange:
                print(f"Warning: Exchange not found for MIC {mic}")
                continue
            
            # Create LISTED_ON edge
            edge_mgr.add_edge(
                src_syn_id=company['syn_id'],
                dst_syn_id=exchange['syn_id'],
                rel_type='LISTED_ON',
                source='manual',
                confidence=1.0,
                attrs={'primary_listing': True},
            )
            
            print(f"Created edge: {company['canonical_name']} LISTED_ON {exchange['canonical_name']}")
            count += 1
        
        except Exception as e:
            print(f"Error creating edge for {ticker} -> {mic}: {e}")
            continue
    
    return count


def seed_sector_edges(registry: EntityRegistry, edge_mgr: EdgeManager) -> int:
    """
    Create BELONGS_TO edges for sector classification.
    
    Returns:
        Number of edges created
    """
    count = 0
    
    # First, create or find sector entities (idempotent)
    sectors = [
        ('Technology', 'SC'),
        ('Financial Services', 'SC'),
        ('Consumer Cyclical', 'SC'),
        ('Healthcare', 'SC'),
        ('Consumer Defensive', 'SC'),
    ]
    
    sector_ids = {}
    for sector_name, prefix in sectors:
        try:
            # Check if sector already exists
            existing = registry.search_by_name(sector_name, limit=1)
            if existing and existing[0]['canonical_name'] == sector_name and existing[0]['type'] == 'SECTOR':
                syn_id = existing[0]['syn_id']
                print(f"Found existing sector: {sector_name} ({syn_id})")
            else:
                # Create new sector
                syn_id = registry.create_entity(
                    entity_type='SECTOR',
                    canonical_name=sector_name,
                    status='ACTIVE',
                )
                print(f"Created sector: {sector_name} ({syn_id})")
            
            sector_ids[sector_name] = syn_id
        
        except Exception as e:
            print(f"Error with sector {sector_name}: {e}")
    
    # Map companies to sectors
    company_sectors = [
        ('AAPL', 'Technology'),
        ('MSFT', 'Technology'),
        ('GOOGL', 'Technology'),
        ('AMZN', 'Consumer Cyclical'),
        ('NVDA', 'Technology'),
        ('TSLA', 'Consumer Cyclical'),
        ('META', 'Technology'),
        ('JPM', 'Financial Services'),
        ('V', 'Financial Services'),
        ('JNJ', 'Healthcare'),
        ('WMT', 'Consumer Defensive'),
        ('PG', 'Consumer Defensive'),
    ]
    
    for ticker, sector_name in company_sectors:
        try:
            # Resolve company
            company = registry.resolve_identifier('TICKER', ticker)
            if not company:
                print(f"Warning: Company not found for ticker {ticker}")
                continue
            
            # Get sector ID
            sector_id = sector_ids.get(sector_name)
            if not sector_id:
                print(f"Warning: Sector not found: {sector_name}")
                continue
            
            # Create BELONGS_TO edge
            edge_mgr.add_edge(
                src_syn_id=company['syn_id'],
                dst_syn_id=sector_id,
                rel_type='BELONGS_TO',
                source='manual',
                confidence=1.0,
                attrs={'classification': 'GICS'},
            )
            
            print(f"Created edge: {company['canonical_name']} BELONGS_TO {sector_name}")
            count += 1
        
        except Exception as e:
            print(f"Error creating sector edge for {ticker}: {e}")
            continue
    
    return count


def main():
    """Main seed edges function."""
    print("=" * 80)
    print("Seeding ontology edges...")
    print("=" * 80)
    print()
    
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            edge_mgr = EdgeManager(conn)
            
            total_edges = 0
            
            # Seed company-exchange edges
            print("Creating LISTED_ON edges...")
            count = seed_company_exchange_edges(registry, edge_mgr)
            print(f"Created {count} LISTED_ON edges\n")
            total_edges += count
            
            # Seed sector edges
            print("Creating BELONGS_TO edges...")
            count = seed_sector_edges(registry, edge_mgr)
            print(f"Created {count} BELONGS_TO edges\n")
            total_edges += count
            
            # Commit all changes
            conn.commit()
            
            print("=" * 80)
            print(f"Total edges created: {total_edges}")
            print("Edge seeding complete!")
    
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

