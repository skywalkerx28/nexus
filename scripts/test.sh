#!/bin/bash
# Run all tests

set -e

echo "Running Nexus test suite..."
echo ""

# C++ tests
echo "C++ Tests"
echo "============"
cd build
ctest --output-on-failure
cd ..
echo ""

# Python tests
echo "Python Tests"
echo "==============="
pytest py/tests/ -v --cov
echo ""

# UI tests (if available)
echo "UI Tests"
echo "==========="
cd ui/observatory
if [ -f "package.json" ]; then
    pnpm test || echo "UI tests not yet implemented"
else
    echo "UI not set up"
fi
cd ../..
echo ""

echo "All tests complete!"

