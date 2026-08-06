"""Market regime classification.

Reuses the platform's existing indicator math (`features.technical`) rather
than inventing new formulas: ADX for trend strength, a moving-average slope
for trend direction, and annualized historical volatility for the
volatility regime. A high-volatility read takes priority over a trend read
(a violently trending market is still, first and foremost, a hard market
to size risk in) — every threshold is a fixed, documented number, not a
learned or fitted cutoff.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.services.features import technical

HIGH_VOLATILITY_PCT = 80.0  # annualized historical volatility threshold
TRENDING_ADX = 25.0
SLOPE_LOOKBACK = 10


@dataclass
class RegimeResult:
    regime: str  # "trending_up" | "trending_down" | "ranging" | "high_volatility"
    adx: float
    slope_pct: float
    volatility_pct: float
    reason: str


def detect_regime(df: pd.DataFrame) -> RegimeResult:
    if len(df) < max(SLOPE_LOOKBACK + 1, 20):
        raise ValueError("Need at least 20 bars to classify a market regime")

    adx_val = float(technical.adx(df).iloc[-1])
    vol_val = float(technical.historical_volatility(df).iloc[-1])
    ma = technical.ema(df["close"], 20)
    slope_pct = float((ma.iloc[-1] / ma.iloc[-1 - SLOPE_LOOKBACK] - 1) * 100) if len(ma) > SLOPE_LOOKBACK else 0.0

    if vol_val >= HIGH_VOLATILITY_PCT:
        return RegimeResult(
            "high_volatility", adx_val, slope_pct, vol_val,
            f"Annualized volatility {vol_val:.0f}% exceeds the {HIGH_VOLATILITY_PCT:.0f}% high-volatility threshold.",
        )
    if adx_val >= TRENDING_ADX and slope_pct > 0:
        return RegimeResult(
            "trending_up", adx_val, slope_pct, vol_val,
            f"ADX {adx_val:.0f} >= {TRENDING_ADX:.0f} with a rising {SLOPE_LOOKBACK}-bar EMA slope ({slope_pct:+.1f}%).",
        )
    if adx_val >= TRENDING_ADX and slope_pct < 0:
        return RegimeResult(
            "trending_down", adx_val, slope_pct, vol_val,
            f"ADX {adx_val:.0f} >= {TRENDING_ADX:.0f} with a falling {SLOPE_LOOKBACK}-bar EMA slope ({slope_pct:+.1f}%).",
        )
    return RegimeResult(
        "ranging", adx_val, slope_pct, vol_val,
        f"ADX {adx_val:.0f} below the {TRENDING_ADX:.0f} trending threshold — no directional regime confirmed.",
    )
