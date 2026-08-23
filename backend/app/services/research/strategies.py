"""Five transparent, rule-based strategy families — the 2026-08-23 research
iteration's second track, run alongside (not instead of) the ML families in
training.py. Each strategy is a fixed, human-readable threshold rule over
already-computed point-in-time features (services/research/features.py) —
zero fitted parameters, so there is nothing for a strategy to "leak" across
a train/test boundary: the rule is written down before it ever sees any
data, walk-forward or holdout.

Every rule reads only `ResearchSample.features.values` (point-in-time by
construction — see features.py's own leakage tests) and returns one of
"BUY" / "SELL" / "NO_TRADE". None of these thresholds were tuned against
this platform's backtest results — each is a standard, textbook definition
of the named strategy style, chosen before any walk-forward run.
"""
from __future__ import annotations

from collections.abc import Callable

Rule = Callable[[dict], str]


def trend_momentum(f: dict) -> str:
    """Classic trend-following: price above both a fast and slow moving
    average (structural uptrend) plus positive MACD momentum and a
    positive regime slope (the trend is actually advancing, not just
    technically "above" a flat average)."""
    bullish = f["price_vs_sma20_pct"] > 0 and f["price_vs_ema9_pct"] > 0 and f["macd_histogram"] > 0 and f["regime_slope_pct"] > 0
    bearish = f["price_vs_sma20_pct"] < 0 and f["price_vs_ema9_pct"] < 0 and f["macd_histogram"] < 0 and f["regime_slope_pct"] < 0
    if bullish:
        return "BUY"
    if bearish:
        return "SELL"
    return "NO_TRADE"


def breakout(f: dict) -> str:
    """New-high/new-low breakout confirmed by above-average volume — a
    breakout on thin volume is exactly the false-breakout pattern this
    rule is designed to reject."""
    near_high = f["pct_from_52w_high"] > -2.0
    near_low = f["pct_from_52w_low"] < 2.0
    volume_confirms = f["relative_volume"] > 1.5
    if near_high and volume_confirms:
        return "BUY"
    if near_low and volume_confirms:
        return "SELL"
    return "NO_TRADE"


def mean_reversion(f: dict) -> str:
    """Oversold/overbought reversion: RSI at a classic extreme AND price
    meaningfully stretched away from its own 20-day average — RSI alone
    fires far too often to be a real "stretched" signal, so both must
    agree."""
    oversold = f["rsi_14"] < 30 and f["price_vs_sma20_pct"] < -3.0
    overbought = f["rsi_14"] > 70 and f["price_vs_sma20_pct"] > 3.0
    if oversold:
        return "BUY"
    if overbought:
        return "SELL"
    return "NO_TRADE"


def volatility_regime(f: dict) -> str:
    """Regime-conditioned: apply trend logic only when ADX shows a real
    trend (>25) and apply mean-reversion logic only in a genuinely
    range-bound regime (ADX<20) — the two other strategies' own logic,
    but gated so each only fires in the market condition it's actually
    designed for, rather than blindly in every regime."""
    if f["adx"] > 25:
        return trend_momentum(f)
    if f["adx"] < 20:
        return mean_reversion(f)
    return "NO_TRADE"


def multi_factor_confirmation(f: dict) -> str:
    """Highest-conviction, lowest-frequency by design: requires at least
    3 of 4 independent bullish/bearish votes (trend structure, breakout
    proximity+volume, relative strength vs SPY, RSI not already extended
    against the trade) to agree before firing — a genuine confirmation
    requirement, not just one indicator relabeled."""
    bull_votes = sum([
        f["price_vs_sma20_pct"] > 0 and f["macd_histogram"] > 0,
        f["pct_from_52w_high"] > -5.0 and f["relative_volume"] > 1.2,
        f["relative_strength_spy_10d_pct"] > 0,
        f["rsi_14"] < 70,
    ])
    bear_votes = sum([
        f["price_vs_sma20_pct"] < 0 and f["macd_histogram"] < 0,
        f["pct_from_52w_low"] < 5.0 and f["relative_volume"] > 1.2,
        f["relative_strength_spy_10d_pct"] < 0,
        f["rsi_14"] > 30,
    ])
    if bull_votes >= 3:
        return "BUY"
    if bear_votes >= 3:
        return "SELL"
    return "NO_TRADE"


STRATEGIES: dict[str, Rule] = {
    "trend_momentum": trend_momentum,
    "breakout": breakout,
    "mean_reversion": mean_reversion,
    "volatility_regime": volatility_regime,
    "multi_factor_confirmation": multi_factor_confirmation,
}
