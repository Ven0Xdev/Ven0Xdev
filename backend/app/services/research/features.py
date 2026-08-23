"""Phase 3 — point-in-time feature pipeline for the historical research
models.

A deliberately separate schema from services/ml/feature_vector.py's
FEATURE_NAMES (the live platform's OTC-manipulation-oriented feature set
— dilution/insider-ownership/manipulation-risk, mostly meaningless for
this research universe's NASDAQ names and ETFs). Reuses the underlying
math (technical.py, regime.py) directly; only the *schema* is new.

Every function here takes a `window` (or windows) that must already be
truncated to bars up to and including the entry timestamp — this module
never queries "all bars for a symbol," only ever what its caller hands
it, so a caller that (correctly) slices `df.loc[:entry_ts]` before
calling this module is the only thing standing between it and lookahead.
The fundamentals/news lookups below apply the actual point-in-time
filter themselves (`filed_date <= entry_ts` / `published_at <= entry_ts`)
directly against the database, which is the one place in this module
where the boundary is enforced in code rather than trusted from the
caller.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.historical_news import HistoricalNewsArticle
from app.db.models.point_in_time_fundamental import PointInTimeFundamental
from app.services.features import technical
from app.services.features.regime import detect_regime

RESEARCH_FEATURE_SCHEMA_VERSION = "research-features-v1"

RESEARCH_FEATURE_NAMES: list[str] = [
    "rsi_14",
    "macd_histogram",
    "adx",
    "atr_pct",
    "bb_width_pct",
    "relative_volume",
    "historical_volatility_pct",
    "gap_pct",
    "spread_pct",
    "price_vs_vwap_pct",
    "price_vs_sma20_pct",
    "price_vs_ema9_pct",
    "pct_from_52w_high",
    "pct_from_52w_low",
    "regime_slope_pct",
    "relative_strength_spy_10d_pct",
    "relative_strength_qqq_10d_pct",
    "fundamental_revenue_yoy_pct",
    "fundamental_net_income_yoy_pct",
    "fundamental_data_available",
    "news_sentiment_avg_7d",
    "news_count_7d",
    "news_data_available",
]

MIN_BARS_FOR_FEATURES = 25
_NEWS_LOOKBACK_DAYS = 7
_YOY_CUTOFF_DAYS = 300  # >= ~10 months back — a real prior-year filing, not a recent quarter mistaken for one


@dataclass
class FeatureSnapshot:
    ticker_symbol: str
    as_of: datetime
    values: dict[str, float]  # keyed by RESEARCH_FEATURE_NAMES, always fully populated

    def as_vector(self) -> list[float]:
        return [self.values[name] for name in RESEARCH_FEATURE_NAMES]


def _relative_strength(window: pd.DataFrame, benchmark_window: pd.DataFrame | None, n: int = 10) -> float:
    if benchmark_window is None or len(window) <= n or len(benchmark_window) <= n:
        return 0.0
    own_return = float(window["close"].iloc[-1] / window["close"].iloc[-1 - n] - 1) * 100
    bench_return = float(benchmark_window["close"].iloc[-1] / benchmark_window["close"].iloc[-1 - n] - 1) * 100
    return own_return - bench_return


def _yoy_pct(db: Session, ticker_symbol: str, concept: str, as_of: datetime) -> float | None:
    """Real year-over-year change using only facts this issuer had
    actually FILED (not merely reached the period-end of) by `as_of` —
    the point-in-time correctness this whole table exists for."""
    rows = (
        db.query(PointInTimeFundamental)
        .filter(
            PointInTimeFundamental.ticker_symbol == ticker_symbol,
            PointInTimeFundamental.concept == concept,
            PointInTimeFundamental.filed_date <= as_of,
        )
        .order_by(PointInTimeFundamental.period_end.desc())
        .all()
    )
    if not rows:
        return None
    latest = rows[0]
    cutoff = latest.period_end - timedelta(days=_YOY_CUTOFF_DAYS)
    older = [r for r in rows if r.period_end <= cutoff]
    if not older or older[0].value == 0:
        return None
    return (latest.value / older[0].value - 1) * 100


def _fundamental_features(db: Session, ticker_symbol: str, as_of: datetime) -> dict[str, float]:
    revenue_yoy = _yoy_pct(db, ticker_symbol, "Revenues", as_of)
    net_income_yoy = _yoy_pct(db, ticker_symbol, "NetIncomeLoss", as_of)
    available = revenue_yoy is not None or net_income_yoy is not None
    return {
        "fundamental_revenue_yoy_pct": revenue_yoy if revenue_yoy is not None else 0.0,
        "fundamental_net_income_yoy_pct": net_income_yoy if net_income_yoy is not None else 0.0,
        "fundamental_data_available": 1.0 if available else 0.0,
    }


def _news_features(db: Session, ticker_symbol: str, as_of: datetime) -> dict[str, float]:
    """`news_data_available=0` means exactly "no historical news has been
    backfilled for this ticker as of this timestamp yet" — the model
    must treat that as a missing feature, never as "confirmed neutral
    sentiment." Once services/research/lowpri_backfill.py has ingested
    at least one article for this ticker at-or-before `as_of`, the flag
    flips to 1 and a genuine zero-article week becomes a real, meaningful
    zero rather than an unavailable one.
    """
    any_ever = (
        db.query(HistoricalNewsArticle.id)
        .filter(HistoricalNewsArticle.ticker_symbol == ticker_symbol, HistoricalNewsArticle.published_at <= as_of)
        .first()
    )
    if any_ever is None:
        return {"news_sentiment_avg_7d": 0.0, "news_count_7d": 0.0, "news_data_available": 0.0}

    window_start = as_of - timedelta(days=_NEWS_LOOKBACK_DAYS)
    rows = (
        db.query(HistoricalNewsArticle)
        .filter(
            HistoricalNewsArticle.ticker_symbol == ticker_symbol,
            HistoricalNewsArticle.published_at <= as_of,
            HistoricalNewsArticle.published_at >= window_start,
        )
        .all()
    )
    sentiments = [r.sentiment_score for r in rows if r.sentiment_score is not None]
    avg = float(sum(sentiments) / len(sentiments)) if sentiments else 0.0
    return {"news_sentiment_avg_7d": avg, "news_count_7d": float(len(rows)), "news_data_available": 1.0}


def build_feature_snapshot(
    db: Session,
    window: pd.DataFrame,
    ticker_symbol: str,
    as_of: datetime,
    spy_window: pd.DataFrame | None = None,
    qqq_window: pd.DataFrame | None = None,
) -> FeatureSnapshot | None:
    """`window` must be exactly the bars available up to and including
    `as_of` for `ticker_symbol` — this function trusts that boundary
    (see module docstring) but always applies its own point-in-time
    filter for fundamentals/news. Returns None (never a fabricated
    feature row) when `window` is too short to compute reliable
    indicators, matching compute_all_technical_features'/detect_regime's
    own minimum-bar requirements."""
    if len(window) < MIN_BARS_FOR_FEATURES:
        return None

    tech = technical.compute_all_technical_features(window)
    try:
        regime = detect_regime(window)
        slope_pct = regime.slope_pct
    except ValueError:
        slope_pct = 0.0

    values: dict[str, float] = {name: 0.0 for name in RESEARCH_FEATURE_NAMES}
    values.update({
        "rsi_14": tech["rsi_14"],
        "macd_histogram": tech["macd_histogram"],
        "adx": tech["adx"],
        "atr_pct": tech["atr_pct"],
        "bb_width_pct": tech["bb_width_pct"],
        "relative_volume": tech["relative_volume"],
        "historical_volatility_pct": tech["historical_volatility_pct"],
        "gap_pct": tech["gap_pct"],
        "spread_pct": tech["spread_pct"],
        "price_vs_vwap_pct": (tech["price"] / tech["vwap"] - 1) * 100 if tech["vwap"] else 0.0,
        "price_vs_sma20_pct": (tech["price"] / tech["sma_20"] - 1) * 100 if tech["sma_20"] else 0.0,
        "price_vs_ema9_pct": (tech["price"] / tech["ema_9"] - 1) * 100 if tech["ema_9"] else 0.0,
        "pct_from_52w_high": tech["pct_from_52w_high"],
        "pct_from_52w_low": tech["pct_from_52w_low"],
        "regime_slope_pct": slope_pct,
        "relative_strength_spy_10d_pct": _relative_strength(window, spy_window),
        "relative_strength_qqq_10d_pct": _relative_strength(window, qqq_window),
    })
    values.update(_fundamental_features(db, ticker_symbol, as_of))
    values.update(_news_features(db, ticker_symbol, as_of))

    return FeatureSnapshot(ticker_symbol=ticker_symbol, as_of=as_of, values=values)
