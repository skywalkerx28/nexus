"""
Seed the ontology database with initial entities.

Loads curated seed data for US equities, exchanges, and commodities.
"""

import csv
import sys
from pathlib import Path
from typing import Optional

from nexus.ontology.db import get_db_connection
from nexus.ontology.registry import EntityRegistry


def load_companies_from_csv(csv_path: Path, registry: EntityRegistry) -> int:
    """
    Load companies from CSV file.
    
    CSV format: ticker,name,figi,lei,isin
    
    Returns:
        Number of companies loaded
    """
    count = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            ticker = row.get('ticker', '').strip()
            name = row.get('name', '').strip()
            figi = row.get('figi', '').strip()
            lei = row.get('lei', '').strip()
            isin = row.get('isin', '').strip()
            
            if not name:
                print(f"Skipping row with missing name: {row}")
                continue
            
            try:
                # Create company entity
                syn_id = registry.create_entity(
                    entity_type='COMPANY',
                    canonical_name=name,
                    status='ACTIVE',
                )
                
                print(f"Created company: {syn_id} - {name}")
                
                # Add identifiers
                if ticker:
                    registry.add_identifier(syn_id, 'TICKER', ticker)
                    print(f"  Added TICKER: {ticker}")
                
                if figi:
                    registry.add_identifier(syn_id, 'FIGI', figi)
                    print(f"  Added FIGI: {figi}")
                
                if lei:
                    registry.add_identifier(syn_id, 'LEI', lei)
                    print(f"  Added LEI: {lei}")
                
                if isin:
                    registry.add_identifier(syn_id, 'ISIN', isin)
                    print(f"  Added ISIN: {isin}")
                
                count += 1
            
            except Exception as e:
                print(f"Error loading company {name}: {e}")
                continue
    
    return count


def load_exchanges_from_csv(csv_path: Path, registry: EntityRegistry) -> int:
    """
    Load exchanges from CSV file.
    
    CSV format: mic,name,country
    
    Returns:
        Number of exchanges loaded
    """
    count = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            mic = row.get('mic', '').strip()
            name = row.get('name', '').strip()
            country = row.get('country', '').strip()
            
            if not name or not mic:
                print(f"Skipping row with missing name/mic: {row}")
                continue
            
            try:
                # Create exchange entity
                syn_id = registry.create_entity(
                    entity_type='EXCHANGE',
                    canonical_name=name,
                    status='ACTIVE',
                )
                
                print(f"Created exchange: {syn_id} - {name}")
                
                # Add MIC identifier
                registry.add_identifier(syn_id, 'MIC', mic)
                print(f"  Added MIC: {mic}")
                
                count += 1
            
            except Exception as e:
                print(f"Error loading exchange {name}: {e}")
                continue
    
    return count


def load_commodities_from_csv(csv_path: Path, registry: EntityRegistry) -> int:
    """
    Load commodities from CSV file.
    
    CSV format: code,name,class
    
    Returns:
        Number of commodities loaded
    """
    count = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            code = row.get('code', '').strip()
            name = row.get('name', '').strip()
            commodity_class = row.get('class', '').strip()
            
            if not name or not code:
                print(f"Skipping row with missing name/code: {row}")
                continue
            
            try:
                # Create commodity entity
                syn_id = registry.create_entity(
                    entity_type='COMMODITY',
                    canonical_name=name,
                    status='ACTIVE',
                )
                
                print(f"Created commodity: {syn_id} - {name}")
                
                # Add commodity code identifier
                registry.add_identifier(syn_id, 'COMMODITY_CODE', code)
                print(f"  Added COMMODITY_CODE: {code}")
                
                count += 1
            
            except Exception as e:
                print(f"Error loading commodity {name}: {e}")
                continue
    
    return count


def main():
    """Main seed data loading function."""
    data_dir = Path(__file__).parent.parent.parent.parent / 'data' / 'ontology' / 'seed'
    
    print(f"Loading seed data from: {data_dir}")
    print("=" * 80)
    
    if not data_dir.exists():
        print(f"Error: Seed data directory not found: {data_dir}")
        print("Please create seed CSV files in data/ontology/seed/")
        sys.exit(1)
    
    try:
        with get_db_connection() as conn:
            registry = EntityRegistry(conn)
            
            total_loaded = 0
            
            # Load companies
            companies_csv = data_dir / 'seed_companies.csv'
            if companies_csv.exists():
                print("\nLoading companies...")
                count = load_companies_from_csv(companies_csv, registry)
                print(f"Loaded {count} companies")
                total_loaded += count
            else:
                print(f"Warning: {companies_csv} not found, skipping companies")
            
            # Load exchanges
            exchanges_csv = data_dir / 'seed_exchanges.csv'
            if exchanges_csv.exists():
                print("\nLoading exchanges...")
                count = load_exchanges_from_csv(exchanges_csv, registry)
                print(f"Loaded {count} exchanges")
                total_loaded += count
            else:
                print(f"Warning: {exchanges_csv} not found, skipping exchanges")
            
            # Load commodities
            commodities_csv = data_dir / 'seed_commodities.csv'
            if commodities_csv.exists():
                print("\nLoading commodities...")
                count = load_commodities_from_csv(commodities_csv, registry)
                print(f"Loaded {count} commodities")
                total_loaded += count
            else:
                print(f"Warning: {commodities_csv} not found, skipping commodities")
            
            print("=" * 80)
            print(f"Total entities loaded: {total_loaded}")
            print("Seed data loading complete!")
    
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

