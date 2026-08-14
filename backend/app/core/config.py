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
    app_name: str = "Nexora — AI Financial Intelligence"
    environment: Literal["development", "staging", "production", "test"] = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # --- Security ---
    secret_key: str = Field(default="CHANGE_ME_IN_PRODUCTION")
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    algorithm: str = "HS256"
    # Deliberately a plain string field, not list[str]: pydantic-settings
    # eagerly JSON-decodes any env value bound to a list-typed field before
    # a validator ever sees it, so CORS_ORIGINS=http://a,http://b (the
    # friendlier, non-JSON form most .env examples use) would hard-crash
    # startup with a JSONDecodeError. Accepting either syntax here and
    # parsing in the `cors_origins` property below avoids that trap while
    # still supporting the JSON-array form for anyone already using it.
    cors_origins_raw: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="CORS_ORIGINS",
        description='Comma-separated origins, e.g. "http://localhost:3000,http://127.0.0.1:3000". '
        'A JSON array string ([\"http://a\"]) also still works.',
    )

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw.strip()
        if raw.startswith("["):
            import json

            return [str(o).strip() for o in json.loads(raw)]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    # AUTH_REQUIRED=false keeps localhost development friction-free (a
    # local "dev@local" operator principal is injected). Production MUST
    # run with true — main.py refuses production+default-secret outright.
    auth_required: bool = False
    allow_registration: bool = True
    rate_limit_enabled: bool = False
    rate_limit_expensive_per_minute: int = 6

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
    # Resolved against the provider registry (services/data_providers/registry.py)
    # at startup — a plain string so new registered adapters need no config
    # change here; unknown names fail with the list of registered providers.
    market_data_provider: str = "mock"
    # Production must never silently serve fabricated/synthetic prices as if
    # they were real market data. This must be explicitly opted into (e.g. a
    # deliberately-labelled demo deployment) — see the production boot guard
    # in app/main.py, which refuses to start with MARKET_DATA_PROVIDER=mock
    # in production unless this is true. Irrelevant outside production: dev/
    # test environments keep running on the mock provider with zero config,
    # exactly as before.
    allow_synthetic_data: bool = False
    polygon_api_key: str | None = None
    finnhub_api_key: str | None = None
    # twelvedata = primary; alphavantage = automatic fallback when Twelve
    # Data fails. Select the combined behavior with MARKET_DATA_PROVIDER=
    # twelvedata (see services/data_providers/market_data_fallback.py); each
    # vendor can also be selected alone (twelvedata_only / alphavantage).
    twelve_data_api_key: str | None = None
    alpha_vantage_api_key: str | None = None
    otc_markets_api_key: str | None = None
    alpaca_api_key: str | None = None
    alpaca_api_secret: str | None = None
    sec_edgar_user_agent: str = "Nexora contact@nexora.dev"
    # EDGAR enrichment overlays real dilution/filing facts onto fundamentals.
    # Meaningless for the synthetic provider (fake tickers), so it only
    # engages for real providers, and can be forced off here.
    edgar_enrichment_enabled: bool = True
    news_api_key: str | None = None

    # --- LLM / chat assistant ---
    anthropic_api_key: str | None = None
    # Reserved for a future OpenAI-backed chat path — no code reads this yet
    # (the "llm" chat_backend only routes to Anthropic today). Present here
    # so it's a recognized, documented variable rather than a silent no-op
    # if someone sets it expecting it to do something.
    openai_api_key: str | None = None
    chat_model: str = "claude-sonnet-5"
    chat_backend: Literal["llm", "template"] = "template"

    # --- Scanning ---
    scan_interval_seconds: int = 900
    universe_max_tickers: int = 2000

    # --- Optional OTC/micro-cap module (disabled by default) ---
    # Nexora's mainstream experience runs on the Asset Universe Manager's
    # STOCK/ETF/INDEX/COMMODITY/PRECIOUS_METAL universe (services/universe/
    # manager.py). The original OTC penny-stock continuous scanner
    # (app/workers/scan_scheduler.py) and OTC-specific manipulation checks
    # (services/otc/manipulation.py) still exist but only run when this is
    # explicitly enabled — see services/otc/__init__.py.
    otc_module_enabled: bool = False

    # --- Deterministic Risk Engine ---
    # Thresholds a candidate/trade must clear regardless of what any AI
    # agent recommends — configurable per deployment, never hardcoded deep
    # in scoring logic. Defaults match the platform spec's stated minimums.
    risk_min_confidence_pct: float = 65.0
    risk_min_reward_risk_ratio: float = 2.0
    risk_max_portfolio_risk_per_trade_pct: float = 1.0

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
