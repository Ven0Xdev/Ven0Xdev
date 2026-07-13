"""Provider diagnostics: is the configured market-data vendor actually
reachable and authorized right now? One cheap real call, typed outcome,
sanitized errors (tokens never appear — see http_base.sanitize_url)."""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.deps import data_provider, get_current_user
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/health")
def provider_health(
    provider: MarketDataProvider = Depends(data_provider),
    _user=Depends(get_current_user),
):
    started = time.perf_counter()
    ok, error, sample = True, None, []
    try:
        sample = [t.symbol for t in provider.get_universe(limit=1)]
    except ProviderDataUnavailable as exc:
        ok, error = False, str(exc)
    return {
        "provider": provider.name,
        "data_mode": getattr(provider, "data_mode", "unspecified"),
        "ok": ok,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "sample_symbols": sample,
        "error": error,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
