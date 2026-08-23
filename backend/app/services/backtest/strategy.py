"""Default point-in-time signal generator used by the backtest engine.

Deliberately independent of `services.scoring.scorer` (which loads the full
ensemble + SHAP + Monte-Carlo forecasting per call — far too slow to run on
every bar of every symbol in a multi-year backtest). This is a fast,
self-contained technical strategy so the *execution mechanics* (costs,
slippage, halts, walk-forward) can be validated; swap in
`ai_ensemble_signal` (also provided here) for a slower, higher-fidelity
backtest that calls the real scorer at a reduced sampling frequency.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class Signal:
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    take_profit_3: float


def simple_momentum_signal(row: pd.Series) -> Signal | None:
    """Reads a precomputed indicator row (see
    `technical.compute_technical_series`) rather than recomputing indicators
    on a growing window — the growing-window approach is O(n^2) per symbol
    and was the backtest engine's main bottleneck.
    """
    oversold_bounce = 30 < row["rsi_14"] < 55
    macd_turning_up = row["macd_histogram"] > 0
    volume_confirmation = row["relative_volume"] > 1.3
    not_illiquid = row["spread_pct"] < 12

    if not (oversold_bounce and macd_turning_up and volume_confirmation and not_illiquid):
        return None

    price = row["price"]
    atr = max(row["atr"], price * 0.01)
    stop = max(price - atr * 1.5, 0.0001)
    risk = price - stop
    return Signal(
        entry_price=price,
        stop_loss=stop,
        take_profit_1=price + risk * 1.0,
        take_profit_2=price + risk * 2.0,
        take_profit_3=price + risk * 3.5,
    )


def ai_ensemble_signal(window: pd.DataFrame, symbol: str, min_overall_score: float = 60.0, max_manipulation_risk: float = 50.0):
    """Higher-fidelity (and much slower) signal using the full AI scorer.
    Intended for small, sampled backtests rather than full daily walks.
    """
    from app.services.data_providers.mock_provider import MockOTCProvider
    from app.services.scoring.scorer import analyze_ticker

    class _WindowProvider(MockOTCProvider):
        def get_ohlcv(self, symbol_, timeframe="1d", lookback_days=250):
            return window

    analysis = analyze_ticker(symbol, provider=_WindowProvider())
    if analysis.overall_ai_score < min_overall_score or analysis.manipulation_risk > max_manipulation_risk:
        return None
    return Signal(
        entry_price=analysis.ideal_entry_price,
        stop_loss=analysis.stop_loss,
        take_profit_1=analysis.take_profit_1,
        take_profit_2=analysis.take_profit_2,
        take_profit_3=analysis.take_profit_3,
    )
