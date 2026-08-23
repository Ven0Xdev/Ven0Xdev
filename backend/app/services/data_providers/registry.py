"""Provider registry — providers are *registered*, never hardcoded.

Each adapter module registers a builder under its config name at import
time. The factory resolves `MARKET_DATA_PROVIDER` against this registry, so
adding a vendor is: write the adapter, decorate its builder, add its module
to `_ADAPTER_MODULES`. No factory edits, no if/elif chains, and an unknown
name fails with the full list of what IS available.
"""
from __future__ import annotations

import importlib
from collections.abc import Callable
from typing import Protocol

from app.services.data_providers.base import MarketDataProvider


class ProviderBuilder(Protocol):
    def __call__(self, settings) -> MarketDataProvider: ...


_REGISTRY: dict[str, ProviderBuilder] = {}

# The single authoritative list of adapter modules. Importing them runs
# their @register_provider decorators.
_ADAPTER_MODULES = [
    "app.services.data_providers.mock_provider",
    "app.services.data_providers.finnhub_provider",
    "app.services.data_providers.real_providers",  # polygon, otc_markets
    "app.services.data_providers.twelvedata_provider",  # registers "twelvedata_only"
    "app.services.data_providers.alphavantage_provider",  # registers "alphavantage"
    "app.services.data_providers.market_data_fallback",  # registers "twelvedata" (+ AV fallback)
    "app.services.data_providers.alpaca_provider",  # registers "alpaca_only" and "alpaca" (+ TD/AV)
]

_loaded = False


def register_provider(name: str) -> Callable[[ProviderBuilder], ProviderBuilder]:
    def decorator(builder: ProviderBuilder) -> ProviderBuilder:
        _REGISTRY[name.lower()] = builder
        return builder

    return decorator


def _ensure_loaded() -> None:
    global _loaded
    if not _loaded:
        for module in _ADAPTER_MODULES:
            importlib.import_module(module)
        _loaded = True


def registered_providers() -> list[str]:
    _ensure_loaded()
    return sorted(_REGISTRY)


def build_provider(name: str, settings) -> MarketDataProvider:
    _ensure_loaded()
    builder = _REGISTRY.get(name.lower())
    if builder is None:
        raise ValueError(
            f"Unknown MARKET_DATA_PROVIDER={name!r}. Registered providers: {', '.join(registered_providers())}"
        )
    return builder(settings)
