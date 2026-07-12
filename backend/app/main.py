from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import engine, init_timescale_hypertables

settings = get_settings()
configure_logging("DEBUG" if settings.debug else "INFO")

# Refuse to boot a production deployment with development security posture.
if settings.environment == "production":
    if settings.secret_key == "CHANGE_ME_IN_PRODUCTION":
        raise RuntimeError("Refusing to start: SECRET_KEY is the development default in production.")
    if not settings.auth_required:
        raise RuntimeError("Refusing to start: AUTH_REQUIRED must be true in production.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db import models  # noqa: F401 ensures models are registered on Base

    Base.metadata.create_all(bind=engine)
    init_timescale_hypertables()
    yield


app = FastAPI(
    title=settings.app_name,
    description=(
        "AI-powered research platform for OTC stocks: continuous scanning, probability-based "
        "opportunity ranking, manipulation detection, explainable ML, backtesting, and a "
        "conversational trading research assistant. All outputs are probabilistic, never certain."
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
    return {"status": "ok", "environment": settings.environment, "data_provider": settings.market_data_provider}


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "api": settings.api_v1_prefix,
    }
