#!/bin/bash
# Setup script for Nexus Ontology

set -e

echo "========================================="
echo "Nexus Ontology Setup"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check PostgreSQL
echo -n "Checking PostgreSQL... "
if command -v psql &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "Please install PostgreSQL 15+ first"
    exit 1
fi

# Check Python
echo -n "Checking Python... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    echo -e "${GREEN}OK${NC} (${PYTHON_VERSION})"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "Please install Python 3.12+ first"
    exit 1
fi

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
pip install -q python-ulid psycopg[binary,pool] redis fastapi uvicorn

# Create database
echo ""
echo "Creating database..."
DB_NAME="${ONTOLOGY_DB_NAME:-nexus_ontology}"

if psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo -e "${YELLOW}Database $DB_NAME already exists${NC}"
else
    psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || {
        echo -e "${RED}Failed to create database${NC}"
        echo "You may need to run: sudo -u postgres psql -c \"CREATE DATABASE $DB_NAME;\""
        exit 1
    }
    echo -e "${GREEN}Database created${NC}"
fi

# Apply schema
echo ""
echo "Applying schema..."
psql -U postgres -d "$DB_NAME" -f sql/ontology_schema.sql > /dev/null 2>&1 || {
    echo -e "${RED}Failed to apply schema${NC}"
    exit 1
}
echo -e "${GREEN}Schema applied${NC}"

# Create seed data directories
echo ""
echo "Setting up data directories..."
mkdir -p data/ontology/seed
mkdir -p data/ontology/features
echo -e "${GREEN}Directories created${NC}"

# Load seed data
echo ""
echo "Loading seed data..."
if [ -f "data/ontology/seed/seed_companies.csv" ]; then
    python3 py/nexus/ops/seed_ontology.py || {
        echo -e "${YELLOW}Warning: Seed data loading failed${NC}"
    }
    echo -e "${GREEN}Seed data loaded${NC}"
else
    echo -e "${YELLOW}Seed data files not found, skipping${NC}"
fi

# Run tests
echo ""
echo "Running tests..."
pytest py/tests/test_ontology_ulid.py -v -q || {
    echo -e "${YELLOW}Warning: Some tests failed${NC}"
}

echo ""
echo "========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Start the API: make ontology-api"
echo "  2. Test the API: curl http://localhost:8001/health"
echo "  3. View docs: http://localhost:8001/docs"
echo ""
echo "Environment variables (optional):"
echo "  ONTOLOGY_DB_HOST (default: localhost)"
echo "  ONTOLOGY_DB_PORT (default: 5432)"
echo "  ONTOLOGY_DB_NAME (default: nexus_ontology)"
echo "  ONTOLOGY_DB_USER (default: postgres)"
echo "  ONTOLOGY_DB_PASSWORD"
echo ""

