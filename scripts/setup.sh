#!/bin/bash
# Nexus Phase 0 setup script

set -e

echo "Nexus Phase 0 Setup"
echo "======================"

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v cmake &> /dev/null; then
    echo "CMake not found. Please install CMake 3.20+"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Please install Python 3.11+"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js 20+"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing..."
    npm install -g pnpm
fi

echo "Prerequisites satisfied"

# Install pre-commit hooks
echo ""
echo "Installing pre-commit hooks..."
pip install pre-commit
pre-commit install

# Build C++ components
echo ""
echo "Building C++ components..."
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
pip install -e ".[dev]"

# Install UI dependencies
echo ""
echo "Installing UI dependencies..."
cd ui/observatory
pnpm install
cd ../..

# Create data directories
echo ""
echo "Creating data directories..."
mkdir -p data/parquet
mkdir -p logs

# Run tests
echo ""
echo "Running tests..."
echo "  C++ tests..."
cd build && ctest --output-on-failure && cd ..

echo "  Python tests..."
pytest py/tests/ -v

echo ""
echo "Phase 0 setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start Observability API: python -m ops.observability_api.main"
echo "  2. Start UI: cd ui/observatory && pnpm dev"
echo "  3. Visit http://localhost:3000"
echo ""
echo "Documentation:"
echo "  - README.md - Quick start guide"
echo "  - docs/runbooks/ibkr-setup.md - IBKR Gateway setup"
echo "  - readme - Full project vision"

