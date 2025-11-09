.PHONY: help setup build test clean dev stop format lint

help:
	@echo "Nexus Phase 0 - Development Commands"
	@echo "===================================="
	@echo ""
	@echo "Setup & Build:"
	@echo "  make setup    - Initial setup (run once)"
	@echo "  make build    - Build C++ components"
	@echo ""
	@echo "Development:"
	@echo "  make dev      - Start all services (API + UI)"
	@echo "  make stop     - Stop all services"
	@echo ""
	@echo "Testing:"
	@echo "  make test     - Run all tests"
	@echo "  make test-cpp - Run C++ tests only"
	@echo "  make test-py  - Run Python tests only"
	@echo ""
	@echo "Code Quality:"
	@echo "  make format   - Format all code"
	@echo "  make lint     - Run linters"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean    - Clean build artifacts"

setup:
	@chmod +x scripts/*.sh
	@./scripts/setup.sh

build:
	@cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
	@cmake --build build -j$$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

test:
	@./scripts/test.sh

test-cpp:
	@cd build && ctest --output-on-failure

test-py:
	@pytest py/tests/ -v --cov

dev:
	@chmod +x scripts/dev.sh
	@./scripts/dev.sh

stop:
	@chmod +x scripts/stop.sh
	@./scripts/stop.sh

format:
	@echo "Formatting C++ code..."
	@find cpp -name '*.cpp' -o -name '*.hpp' -o -name '*.h' | xargs clang-format -i
	@echo "Formatting Python code..."
	@black py/ ops/
	@echo "Code formatted"

lint:
	@echo "Linting C++..."
	@find cpp -name '*.cpp' -o -name '*.hpp' -o -name '*.h' | xargs clang-format --dry-run --Werror
	@echo "Linting Python..."
	@ruff check py/ ops/
	@black --check py/ ops/
	@echo "Lint checks passed"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf build/
	@rm -rf dist/
	@rm -rf *.egg-info/
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name '*.pyc' -delete
	@find . -type f -name '*.pyo' -delete
	@find . -type f -name '*.so' -delete
	@echo "Clean complete"

