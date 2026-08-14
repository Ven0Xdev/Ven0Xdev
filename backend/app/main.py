import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import engine, init_timescale_hypertables
from app.services.data_providers.http_base import ProviderDataUnavailable

settings = get_settings()
configure_logging("DEBUG" if settings.debug else "INFO")
logger = logging.getLogger(__name__)

# Refuse to boot a production deployment with development security posture.
if settings.environment == "production":
    if settings.secret_key == "CHANGE_ME_IN_PRODUCTION":
        raise RuntimeError("Refusing to start: SECRET_KEY is the development default in production.")
    if not settings.auth_required:
        raise RuntimeError("Refusing to start: AUTH_REQUIRED must be true in production.")

    # A synthetic/demo provider (data_mode == "synthetic", e.g. the mock
    # provider) must never be what a production deployment silently serves.
    # A misconfigured *real* provider (missing API key etc.) is a different,
    # already-safe case: it raises ProviderDataUnavailable per request ->
    # structured 503, which is itself the "clearly labelled unavailable
    # mode" this platform has always used instead of fabricating data — so
    # only an actually-synthetic provider is gated here, not every failure.
    from app.services.data_providers.registry import build_provider

    try:
        _boot_provider = build_provider(settings.market_data_provider, settings)
        _boot_provider_is_synthetic = getattr(_boot_provider, "data_mode", None) == "synthetic"
    except Exception:
        _boot_provider_is_synthetic = False
    if _boot_provider_is_synthetic and not settings.allow_synthetic_data:
        raise RuntimeError(
            f"Refusing to start: MARKET_DATA_PROVIDER={settings.market_data_provider!r} resolves to a "
            "synthetic/demo data source in production. Set MARKET_DATA_PROVIDER to a real vendor "
            "(twelvedata/alphavantage/finnhub) with its API key, or set ALLOW_SYNTHETIC_DATA=true "
            "to run a deliberately-labelled demo deployment."
        )


def _sanitized_db_url() -> str:
    """DB URL safe to log — a DSN's userinfo (user:password@) is credentials,
    never printed even in DEBUG. A SQLite path has no userinfo and is
    logged as-is (it's just a local file path, not a secret)."""
    try:
        url = settings.sqlalchemy_url
        if "@" in url:
            scheme_and_creds, host_and_rest = url.split("@", 1)
            scheme = scheme_and_creds.split("://", 1)[0]
            return f"{scheme}://***:***@{host_and_rest}"
        return url
    except Exception:  # noqa: BLE001 — logging must never itself crash startup
        return "<unparseable>"


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db import models  # noqa: F401 ensures models are registered on Base

    logger.info("Starting %s (environment=%s)", settings.app_name, settings.environment)
    logger.info("Database: %s", _sanitized_db_url())
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables ready.")
    except Exception:
        logger.exception("Database initialization failed — the app cannot serve requests reliably.")
        raise
    init_timescale_hypertables()

    from app.db.session import SessionLocal
    from app.services.universe.manager import seed_default_universe

    with SessionLocal() as seed_db:
        inserted = seed_default_universe(seed_db)
        if inserted:
            logger.info("Asset Universe Manager: seeded %d default assets.", inserted)

    logger.info("Market data provider: %s", settings.market_data_provider)
    if settings.market_data_provider == "mock":
        logger.info("Running on synthetic demo data — set MARKET_DATA_PROVIDER for real market data.")

    if settings.chat_backend == "llm" and not settings.anthropic_api_key:
        logger.warning("CHAT_BACKEND=llm but ANTHROPIC_API_KEY is not set — falling back to the template assistant.")
    logger.info("Chat backend: %s", settings.chat_backend)
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    description=(
        "AI-powered multi-asset market research platform (stocks, ETFs, indices, commodities, "
        "precious metals): continuous scanning, probability-based opportunity ranking, "
        "manipulation detection, explainable ML, backtesting, and a conversational research "
        "assistant. All outputs are probabilistic, never certain. An optional, disabled-by-default "
        "OTC/micro-cap module remains available for future expansion (see "
        "services/otc/__init__.py)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ProviderDataUnavailable)
async def provider_unavailable_handler(request, exc):
    """Degraded mode, not a crash: when the market-data vendor is down,
    redirected, rate-limited, or unauthorized, endpoints answer 503 with a
    structured, honest payload — never HTTP 500 and never substitute data."""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": "provider_unavailable",
                "provider": settings.market_data_provider,
                "message": str(exc),
                "market_data_available": False,
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    """Last-resort catch-all — Starlette only routes here when no more
    specific handler matched (HTTPException/RequestValidationError/
    ProviderDataUnavailable above are all resolved first), so this is
    genuinely unexpected application errors only. Always logs the full
    traceback server-side; the client response includes the exception
    type/message in DEBUG (fast local diagnosis) but collapses to a
    generic message in production so internals never leak to a caller.
    """
    from fastapi.responses import JSONResponse

    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.debug:
        content = {
            "detail": {
                "code": "internal_error",
                "type": type(exc).__name__,
                "message": str(exc),
                "path": str(request.url.path),
            }
        }
    else:
        content = {"detail": {"code": "internal_error", "message": "An unexpected error occurred."}}
    return JSONResponse(status_code=500, content=content)


@app.middleware("http")
async def record_request_latency(request, call_next):
    import time as _time

    from app.services.monitoring import counters

    started = _time.perf_counter()
    response = await call_next(request)
    counters.record_latency(
        f"{request.method} {request.url.path}",
        (_time.perf_counter() - started) * 1000,
    )
    return response

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health_check():
    """Liveness/readiness probe. Every sub-check is defensive — a DB or
    provider hiccup degrades the reported field, it never turns this
    endpoint itself into a 500 (a health check that can crash is useless)."""
    import logging

    logger = logging.getLogger(__name__)

    try:
        with engine.connect() as conn:
            from sqlalchemy import text

            conn.execute(text("SELECT 1"))
        database_status = "connected"
    except Exception as exc:  # noqa: BLE001
        logger.warning("health check: database unreachable: %s", type(exc).__name__)
        database_status = "unreachable"

    if settings.market_data_provider == "mock":
        market_data_status = "demo"
    elif settings.market_data_provider in ("twelvedata", "twelvedata_only") and not settings.twelve_data_api_key:
        market_data_status = "missing_key"
    elif settings.market_data_provider == "alphavantage" and not settings.alpha_vantage_api_key:
        market_data_status = "missing_key"
    elif settings.market_data_provider == "finnhub" and not settings.finnhub_api_key:
        market_data_status = "missing_key"
    else:
        market_data_status = "configured"

    ai_status = "configured" if (settings.chat_backend == "llm" and settings.anthropic_api_key) else "optional"

    return {
        "status": "ok",
        "environment": settings.environment,
        "data_provider": settings.market_data_provider,
        "database": database_status,
        "market_data": market_data_status,
        "ai": ai_status,
    }


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "api": settings.api_v1_prefix,
    }
