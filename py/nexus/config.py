"""Configuration management with Pydantic."""

from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Trading environment."""

    PAPER = "paper"
    LIVE = "live"


class IBKRConfig(BaseModel):
    """IBKR connection configuration."""

    host: str = Field(default="127.0.0.1", description="IB Gateway host")
    port: int = Field(default=7497, description="IB Gateway port (7497=paper, 7496=live)")
    client_id: int = Field(default=42, description="Client ID for connection")
    timeout_sec: int = Field(default=30, description="Connection timeout")


class StorageConfig(BaseModel):
    """Storage configuration."""

    parquet_dir: Path = Field(default=Path("./data/parquet"), description="Parquet data directory")
    log_dir: Path = Field(default=Path("./logs"), description="Log directory")

    @field_validator("parquet_dir", "log_dir")
    @classmethod
    def ensure_absolute(cls, v: Path) -> Path:
        """Ensure paths are absolute."""
        return v.resolve()


class RiskConfig(BaseModel):
    """Risk limits and controls."""

    max_notional: float = Field(default=100_000, gt=0, description="Max notional exposure")
    max_position: int = Field(default=500, gt=0, description="Max position per symbol")
    price_band_bps: int = Field(default=50, gt=0, description="Price band in basis points")
    max_orders_per_sec: int = Field(default=10, gt=0, description="Max orders per second")
    max_cancel_rate_bps: int = Field(
        default=3000, ge=0, le=10000, description="Max cancel rate (bps)"
    )


class UIConfig(BaseModel):
    """UI and observability configuration."""

    observability_api: str = Field(
        default="http://localhost:9400", description="Observability API URL"
    )
    auth_provider: str = Field(default="oidc", description="Auth provider (oidc, mock)")
    ws_heartbeat_sec: int = Field(default=30, description="WebSocket heartbeat interval")


class NexusConfig(BaseSettings):
    """Main Nexus configuration."""

    model_config = SettingsConfigDict(
        env_prefix="NEXUS_",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

    environment: Environment = Field(default=Environment.PAPER, description="Trading environment")
    symbols: List[str] = Field(default=["AAPL", "MSFT", "SPY"], description="Trading symbols")

    ibkr: IBKRConfig = Field(default_factory=IBKRConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    ui: UIConfig = Field(default_factory=UIConfig)

    @classmethod
    def from_yaml(cls, path: Path) -> "NexusConfig":
        """Load configuration from YAML file."""
        with open(path) as f:
            data = yaml.safe_load(f)
        return cls(**data)

    def to_yaml(self, path: Path) -> None:
        """Save configuration to YAML file."""
        with open(path, "w") as f:
            yaml.dump(self.model_dump(mode="python"), f, default_flow_style=False)

    @field_validator("symbols")
    @classmethod
    def validate_symbols(cls, v: List[str]) -> List[str]:
        """Validate symbol list."""
        if not v:
            raise ValueError("At least one symbol required")
        return [s.upper() for s in v]

