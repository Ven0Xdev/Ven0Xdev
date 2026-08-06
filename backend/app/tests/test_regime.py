"""Market regime classification over crafted price paths with a known
character (steady uptrend / downtrend / flat chop / violent whipsaw)."""
import numpy as np
import pandas as pd
import pytest

from app.services.features.regime import detect_regime


def _trend_df(n: int = 60, drift: float = 0.01, noise: float = 0.002) -> pd.DataFrame:
    idx = pd.date_range("2025-01-01", periods=n, freq="D", tz="UTC")
    rng = np.random.default_rng(42)
    log_returns = rng.normal(drift, noise, n)
    closes = 10.0 * np.exp(np.cumsum(log_returns))
    highs = closes * 1.005
    lows = closes * 0.995
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": 500_000.0},
        index=idx,
    )


def _ranging_df(n: int = 60) -> pd.DataFrame:
    idx = pd.date_range("2025-01-01", periods=n, freq="D", tz="UTC")
    t = np.arange(n)
    closes = 10.0 + 0.15 * np.sin(t * (2 * np.pi / 8))
    highs = closes + 0.03
    lows = closes - 0.03
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": 500_000.0},
        index=idx,
    )


def _high_vol_df(n: int = 60) -> pd.DataFrame:
    idx = pd.date_range("2025-01-01", periods=n, freq="D", tz="UTC")
    rng = np.random.default_rng(7)
    log_returns = rng.normal(0, 0.12, n)  # violent daily swings
    closes = 10.0 * np.exp(np.cumsum(log_returns))
    highs = closes * 1.08
    lows = closes * 0.92
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": 500_000.0},
        index=idx,
    )


def test_steady_uptrend_classified_trending_up():
    result = detect_regime(_trend_df(drift=0.015, noise=0.001))
    assert result.regime == "trending_up"
    assert result.slope_pct > 0


def test_steady_downtrend_classified_trending_down():
    result = detect_regime(_trend_df(drift=-0.015, noise=0.001))
    assert result.regime == "trending_down"
    assert result.slope_pct < 0


def test_flat_chop_classified_ranging():
    result = detect_regime(_ranging_df())
    assert result.regime == "ranging"
    assert result.adx < 25.0


def test_violent_swings_classified_high_volatility():
    result = detect_regime(_high_vol_df())
    assert result.regime == "high_volatility"
    assert result.volatility_pct >= 80.0


def test_reason_cites_the_actual_threshold():
    result = detect_regime(_trend_df(drift=0.015, noise=0.001))
    assert str(round(result.adx)) in result.reason or "ADX" in result.reason


def test_too_few_bars_raises():
    with pytest.raises(ValueError):
        detect_regime(_trend_df(n=10))
