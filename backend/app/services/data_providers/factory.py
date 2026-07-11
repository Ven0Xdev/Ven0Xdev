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

        return FinnhubProvider(settings.finnhub_api_key)

    from app.services.data_providers.real_providers import (
        OTCMarketsProvider,
        PolygonOTCProvider,
    )

    if settings.market_data_provider == "polygon":
        return PolygonOTCProvider(settings.polygon_api_key)
    if settings.market_data_provider == "otc_markets":
        return OTCMarketsProvider(settings.otc_markets_api_key)

    return MockOTCProvider()
