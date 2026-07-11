"""Provider factory — resolves configuration to a provider via the registry.

No provider names are hardcoded here: adapters register themselves (see
`registry.py`), and this factory only (1) resolves the configured name,
(2) applies cross-cutting decorators such as SEC EDGAR enrichment. Adding a
vendor never touches this file.
"""
from functools import lru_cache

from app.core.config import get_settings
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.registry import build_provider

# Providers whose tickers are not real SEC registrants — enrichment would be
# meaningless noise for them.
_NO_EDGAR = {"mock"}


@lru_cache
def get_data_provider() -> MarketDataProvider:
    settings = get_settings()
    provider = build_provider(settings.market_data_provider, settings)

    if settings.edgar_enrichment_enabled and settings.market_data_provider not in _NO_EDGAR:
        from app.db.session import SessionLocal
        from app.services.data_providers.edgar_enricher import EdgarEnrichedProvider

        provider = EdgarEnrichedProvider(provider, SessionLocal)

    return provider
