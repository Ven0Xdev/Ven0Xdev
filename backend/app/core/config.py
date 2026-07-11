"""Central application configuration.

All runtime configuration is sourced from environment variables so the same
image can be promoted from dev -> staging -> prod without rebuilding.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "Ven0X OTC Intelligence Platform"
    environment: Literal["development", "staging", "production", "test"] = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # --- Security ---
    secret_key: str = Field(default="CHANGE_ME_IN_PRODUCTION")
    access_token_expire_minutes: int = 60 * 24
    algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Database ---
    database_url: str = Field(
        default="postgresql+psycopg://ven0x:ven0x@localhost:5432/ven0x_otc",
        description="TimescaleDB/PostgreSQL DSN. Falls back to SQLite for local dev/tests.",
    )
    use_sqlite_fallback: bool = True
    sqlite_path: str = "sqlite:///./ven0x_dev.db"

    # --- Redis / caching / task queue ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Market data providers ---
    # Real production deployments should set these. Without them the platform
    # transparently falls back to a deterministic synthetic OTC data provider
    # so the system is fully runnable/demoable out of the box.
    market_data_provider: Literal["mock", "polygon", "finnhub", "otc_markets"] = "mock"
    polygon_api_key: str | None = None
    finnhub_api_key: str | None = None
    otc_markets_api_key: str | None = None
    sec_edgar_user_agent: str = "Ven0X OTC Intelligence Platform contact@ven0x.dev"
    # EDGAR enrichment overlays real dilution/filing facts onto fundamentals.
    # Meaningless for the synthetic provider (fake tickers), so it only
    # engages for real providers, and can be forced off here.
    edgar_enrichment_enabled: bool = True
    news_api_key: str | None = None

    # --- LLM / chat assistant ---
    anthropic_api_key: str | None = None
    chat_model: str = "claude-sonnet-5"
    chat_backend: Literal["llm", "template"] = "template"

    # --- Scanning ---
    scan_interval_seconds: int = 900
    universe_max_tickers: int = 2000

    # --- ML ---
    model_artifact_dir: str = "./model_artifacts"
    random_seed: int = 42

    @property
    def sqlalchemy_url(self) -> str:
        import os

        database_url_explicitly_set = "DATABASE_URL" in os.environ
        if database_url_explicitly_set or not self.use_sqlite_fallback:
            return self.database_url
        return self.sqlite_path


@lru_cache
def get_settings() -> Settings:
    return Settings()
