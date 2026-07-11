from functools import lru_cache

from app.core.config import get_settings
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.mock_provider import MockOTCProvider


@lru_cache
def get_data_provider() -> MarketDataProvider:
    settings = get_settings()
    if settings.market_data_provider == "mock":
        return MockOTCProvider()

    if settings.market_data_provider == "finnhub":
        from app.services.data_providers.finnhub_provider import FinnhubProvider

        # Universe size is config-driven: on the free tier (60 calls/min),
        # each analyzed ticker costs ~4 upstream calls, so a small universe
        # keeps the first scan interactive instead of half an hour long.
        provider = FinnhubProvider(
            settings.finnhub_api_key,
            universe_limit=settings.universe_max_tickers,
        )
        return _maybe_wrap_edgar(provider, settings)

    from app.services.data_providers.real_providers import (
        OTCMarketsProvider,
        PolygonOTCProvider,
    )

    if settings.market_data_provider == "polygon":
        return _maybe_wrap_edgar(PolygonOTCProvider(settings.polygon_api_key), settings)
    if settings.market_data_provider == "otc_markets":
        return _maybe_wrap_edgar(OTCMarketsProvider(settings.otc_markets_api_key), settings)

    return MockOTCProvider()


def _maybe_wrap_edgar(provider: MarketDataProvider, settings) -> MarketDataProvider:
    """Overlay locally-ingested SEC EDGAR facts onto real providers.
    Never applied to the mock provider — its tickers aren't SEC-registered.
    """
    if not settings.edgar_enrichment_enabled:
        return provider

    from app.db.session import SessionLocal
    from app.services.data_providers.edgar_enricher import EdgarEnrichedProvider

    return EdgarEnrichedProvider(provider, SessionLocal)
