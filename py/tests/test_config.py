"""Tests for configuration management."""

import tempfile
from pathlib import Path

import pytest
from nexus.config import (
    Environment,
    IBKRConfig,
    NexusConfig,
    RiskConfig,
    StorageConfig,
    UIConfig,
)


def test_default_config():
    """Test default configuration values."""
    config = NexusConfig()
    assert config.environment == Environment.PAPER
    assert len(config.symbols) >= 1
    assert config.ibkr.port == 7497  # Paper port


def test_ibkr_config():
    """Test IBKR configuration."""
    ibkr = IBKRConfig(host="localhost", port=7496, client_id=100)
    assert ibkr.host == "localhost"
    assert ibkr.port == 7496
    assert ibkr.client_id == 100


def test_risk_config_validation():
    """Test risk configuration validation."""
    risk = RiskConfig(max_notional=50000, max_position=100)
    assert risk.max_notional == 50000
    assert risk.max_position == 100

    with pytest.raises(ValueError):
        RiskConfig(max_notional=-1000)  # Must be positive


def test_symbol_validation():
    """Test symbol list validation."""
    config = NexusConfig(symbols=["aapl", "msft"])
    assert config.symbols == ["AAPL", "MSFT"]  # Should be uppercase

    with pytest.raises(ValueError):
        NexusConfig(symbols=[])  # Must have at least one symbol


def test_yaml_roundtrip():
    """Test YAML serialization and deserialization."""
    config = NexusConfig(
        environment=Environment.PAPER,
        symbols=["AAPL", "MSFT"],
        ibkr=IBKRConfig(port=7497),
    )

    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        temp_path = Path(f.name)
        config.to_yaml(temp_path)

    loaded = NexusConfig.from_yaml(temp_path)
    assert loaded.environment == config.environment
    assert loaded.symbols == config.symbols
    assert loaded.ibkr.port == config.ibkr.port

    temp_path.unlink()


def test_environment_enum():
    """Test environment enumeration."""
    assert Environment.PAPER.value == "paper"
    assert Environment.LIVE.value == "live"


def test_storage_paths():
    """Test storage path configuration."""
    storage = StorageConfig(parquet_dir=Path("./data"), log_dir=Path("./logs"))
    assert storage.parquet_dir.is_absolute()
    assert storage.log_dir.is_absolute()

