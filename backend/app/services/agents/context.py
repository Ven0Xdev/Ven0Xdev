"""Shared read-only context every agent deliberates over.

Built once per deliberation so all agents argue about the *same* facts —
no agent fetches its own data mid-debate.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import Fundamentals, MarketDataProvider, NewsArticle, TickerMeta
from app.services.features import technical
from app.services.scoring.scorer import analyze_ticker


@dataclass
class DeliberationContext:
    symbol: str
    analysis: StockAnalysis
    tech: dict
    meta: TickerMeta
    fundamentals: Fundamentals
    news: list[NewsArticle]
    db: Session | None = None


def build_context(symbol: str, provider: MarketDataProvider, db: Session | None = None) -> DeliberationContext:
    symbol = symbol.upper()
    analysis = analyze_ticker(symbol, provider=provider)
    df = provider.get_ohlcv(symbol, lookback_days=300)
    return DeliberationContext(
        symbol=symbol,
        analysis=analysis,
        tech=technical.compute_all_technical_features(df),
        meta=provider.get_ticker_meta(symbol),
        fundamentals=provider.get_fundamentals(symbol),
        news=provider.get_news(symbol),
        db=db,
    )
