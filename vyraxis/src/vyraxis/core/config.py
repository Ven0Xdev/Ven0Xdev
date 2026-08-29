"""Configuration management.

All configuration arrives from the environment (or a local ``.env``), never
from hard-coded literals. Secrets are held in ``SecretStr`` so that an
accidental ``repr`` or log call cannot leak them.

Environment variables use the prefix ``VYRAXIS_`` and ``__`` as the nesting
delimiter, e.g. ``VYRAXIS_SOLANA__RPC_HTTP_URL``. See ``.env.example``.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from vyraxis.core.errors import ConfigurationError

Environment = Literal["local", "test", "staging", "production"]
Commitment = Literal["processed", "confirmed", "finalized"]


class AppSettings(BaseModel):
    """Process-level identity and logging behaviour."""

    environment: Environment = "local"
    service_name: str = "vyraxis"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_format: Literal["json", "console"] = "json"
    instance_id: str = Field(
        default="local-1",
        description="Distinguishes concurrent ingest workers in logs and system_events.",
    )


class DatabaseSettings(BaseModel):
    """PostgreSQL connection settings.

    Only PostgreSQL is supported. Financial columns rely on NUMERIC semantics
    and the ingestion path relies on ``ON CONFLICT DO NOTHING`` for
    dedup-on-write; substituting another engine would silently change both.
    """

    url: SecretStr = Field(
        default=SecretStr("postgresql+asyncpg://vyraxis:vyraxis@localhost:5432/vyraxis"),
        description="SQLAlchemy async DSN, e.g. postgresql+asyncpg://user:pass@host:5432/db",
    )
    pool_size: int = Field(default=5, ge=1, le=100)
    max_overflow: int = Field(default=5, ge=0, le=100)
    pool_timeout_seconds: float = Field(default=10.0, gt=0)
    command_timeout_seconds: float = Field(default=30.0, gt=0)
    echo_sql: bool = False

    @field_validator("url")
    @classmethod
    def _require_async_postgres(cls, value: SecretStr) -> SecretStr:
        dsn = value.get_secret_value()
        scheme = urlsplit(dsn).scheme
        if scheme in {"postgresql", "postgres"}:
            dsn = re.sub(r"^postgres(ql)?://", "postgresql+asyncpg://", dsn, count=1)
            return SecretStr(dsn)
        if scheme != "postgresql+asyncpg":
            raise ValueError(
                "database url must use the postgresql+asyncpg driver "
                f"(got scheme {scheme!r}); only PostgreSQL is supported"
            )
        return value

    @property
    def dsn(self) -> str:
        """The async DSN. Callers must not log the result."""
        return self.url.get_secret_value()

    @property
    def safe_dsn(self) -> str:
        """DSN with credentials stripped, safe to log."""
        return redact_dsn(self.dsn)


class SolanaSettings(BaseModel):
    """Solana RPC/WebSocket endpoints and resilience policy.

    No endpoint is baked in beyond a localhost default: the operator chooses the
    provider, and swapping providers must never require a code change.
    """

    rpc_http_url: str = Field(default="http://127.0.0.1:8899")
    rpc_ws_url: str = Field(default="ws://127.0.0.1:8900")
    provider_name: str = Field(
        default="unspecified",
        description="Free-form label recorded on every persisted event for provenance.",
    )
    commitment: Commitment = "confirmed"

    request_timeout_seconds: float = Field(default=15.0, gt=0)
    max_request_attempts: int = Field(default=4, ge=1, le=10)

    ws_connect_timeout_seconds: float = Field(default=15.0, gt=0)
    ws_ping_interval_seconds: float = Field(default=20.0, gt=0)
    ws_ping_timeout_seconds: float = Field(default=20.0, gt=0)
    ws_stale_after_seconds: float = Field(
        default=90.0,
        gt=0,
        description=(
            "If no message arrives within this window the connection is treated as "
            "stale and recycled. Silence is a failure mode, not a healthy idle."
        ),
    )
    ws_max_message_bytes: int = Field(default=8 * 1024 * 1024, ge=64 * 1024)

    reconnect_initial_backoff_seconds: float = Field(default=1.0, gt=0)
    reconnect_max_backoff_seconds: float = Field(default=60.0, gt=0)
    reconnect_backoff_multiplier: float = Field(default=2.0, gt=1.0)
    reconnect_jitter_ratio: float = Field(default=0.25, ge=0, le=1)
    max_reconnect_attempts: int = Field(
        default=0, ge=0, description="0 means retry forever with capped backoff."
    )

    @field_validator("rpc_http_url")
    @classmethod
    def _http_scheme(cls, value: str) -> str:
        if urlsplit(value).scheme not in {"http", "https"}:
            raise ValueError(f"rpc_http_url must be http(s), got {value!r}")
        return value.rstrip("/")

    @field_validator("rpc_ws_url")
    @classmethod
    def _ws_scheme(cls, value: str) -> str:
        if urlsplit(value).scheme not in {"ws", "wss"}:
            raise ValueError(f"rpc_ws_url must be ws(s), got {value!r}")
        return value.rstrip("/")

    @model_validator(mode="after")
    def _backoff_sane(self) -> SolanaSettings:
        if self.reconnect_max_backoff_seconds < self.reconnect_initial_backoff_seconds:
            raise ValueError("reconnect_max_backoff_seconds must be >= initial backoff")
        if self.ws_stale_after_seconds <= self.ws_ping_interval_seconds:
            raise ValueError(
                "ws_stale_after_seconds must exceed ws_ping_interval_seconds, otherwise a "
                "healthy idle connection is recycled on every ping cycle"
            )
        return self


class IngestionSettings(BaseModel):
    """Queue sizing, batching and dedup policy for the data engine."""

    raw_queue_size: int = Field(default=10_000, ge=16)
    normalized_queue_size: int = Field(default=10_000, ge=16)
    persist_batch_size: int = Field(default=200, ge=1, le=5_000)
    persist_flush_interval_seconds: float = Field(default=1.0, gt=0)
    dedup_cache_size: int = Field(
        default=200_000,
        ge=1_000,
        description=(
            "In-memory first-line dedup. The database UNIQUE constraint remains the "
            "authoritative check; this only avoids pointless round-trips."
        ),
    )
    watched_programs: list[str] = Field(
        default_factory=list,
        description=(
            "Program IDs to subscribe to. Empty means 'use the built-in registry "
            "defaults' (see vyraxis.solana.programs)."
        ),
    )
    subscribe_token_program: bool = True
    drop_on_full_queue: bool = Field(
        default=False,
        description=(
            "When False (default) ingestion applies backpressure instead of dropping "
            "events. Dropping is always counted and logged, never silent."
        ),
    )


class ObservationSettings(BaseModel):
    """Horizons at which post-discovery observations are scheduled."""

    horizons_seconds: list[int] = Field(
        default_factory=lambda: [30, 60, 300, 900, 1800, 3600, 21600, 86400]
    )

    @field_validator("horizons_seconds")
    @classmethod
    def _sorted_positive_unique(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("at least one observation horizon is required")
        if any(h <= 0 for h in value):
            raise ValueError("observation horizons must be positive")
        if len(set(value)) != len(value):
            raise ValueError("observation horizons must be unique")
        return sorted(value)


class SafetySettings(BaseModel):
    """Fail-closed safety switches.

    Live execution is not implemented in this codebase. The flag exists so the
    refusal is explicit and testable rather than an absence someone might not
    notice.
    """

    live_trading_enabled: bool = False
    paper_trading_enabled: bool = False

    @field_validator("live_trading_enabled")
    @classmethod
    def _live_trading_forbidden(cls, value: bool) -> bool:
        if value:
            raise ValueError(
                "live trading is not implemented and cannot be enabled. VYRAXIS holds no "
                "keys and has no signing path; see docs/ROADMAP.md Phase 9."
            )
        return value


class ApiSettings(BaseModel):
    """Health/observability HTTP surface."""

    host: str = "127.0.0.1"
    port: int = Field(default=8080, ge=1, le=65535)


class Settings(BaseSettings):
    """Root settings object. Construct via :func:`get_settings`."""

    model_config = SettingsConfigDict(
        env_prefix="VYRAXIS_",
        env_nested_delimiter="__",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app: AppSettings = Field(default_factory=AppSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    solana: SolanaSettings = Field(default_factory=SolanaSettings)
    ingestion: IngestionSettings = Field(default_factory=IngestionSettings)
    observations: ObservationSettings = Field(default_factory=ObservationSettings)
    safety: SafetySettings = Field(default_factory=SafetySettings)
    api: ApiSettings = Field(default_factory=ApiSettings)

    def describe(self) -> dict[str, Any]:
        """Log-safe view of the configuration (secrets redacted)."""
        payload = self.model_dump(mode="json")
        payload["database"]["url"] = self.database.safe_dsn
        return payload


_DSN_CREDENTIALS = re.compile(r"://([^:/@]+)(:[^@]*)?@")


def redact_dsn(dsn: str) -> str:
    """Replace credentials in a DSN with placeholders."""
    return _DSN_CREDENTIALS.sub("://***:***@", dsn)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and cache settings, converting validation failures into ConfigurationError."""
    try:
        return Settings()
    except Exception as exc:  # pydantic ValidationError and friends
        raise ConfigurationError("invalid VYRAXIS configuration", detail=str(exc)) from exc


def reset_settings_cache() -> None:
    """Drop the cached settings. Used by tests that manipulate the environment."""
    get_settings.cache_clear()
