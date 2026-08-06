"""Candlestick pattern detection over hand-crafted OHLC fixtures — each
fixture is constructed to exactly satisfy (or violate) one rule, so these
tests pin down the real thresholds in patterns.py, not approximate them."""
import pandas as pd

from app.services.features.patterns import detect_patterns


def _df(rows: list[dict]) -> pd.DataFrame:
    idx = pd.date_range("2025-01-01", periods=len(rows), freq="D", tz="UTC")
    return pd.DataFrame(rows, index=idx)


def test_bullish_engulfing_detected():
    rows = [
        {"open": 10.0, "high": 10.2, "low": 9.4, "close": 9.5, "volume": 1000},  # bearish
        {"open": 9.3, "high": 10.5, "low": 9.2, "close": 10.3, "volume": 1200},  # engulfs prior body
    ]
    matches = detect_patterns(_df(rows))
    names = {m.name for m in matches}
    assert "bullish_engulfing" in names
    m = next(m for m in matches if m.name == "bullish_engulfing")
    assert m.direction == "bullish"


def test_bearish_engulfing_detected():
    rows = [
        {"open": 9.5, "high": 10.2, "low": 9.4, "close": 10.0, "volume": 1000},  # bullish
        {"open": 10.3, "high": 10.5, "low": 9.2, "close": 9.3, "volume": 1200},  # engulfs prior body
    ]
    matches = detect_patterns(_df(rows))
    names = {m.name for m in matches}
    assert "bearish_engulfing" in names


def test_hammer_detected():
    rows = [
        {"open": 10.0, "high": 10.05, "low": 9.0, "close": 9.7, "volume": 1000},
    ]
    matches = detect_patterns(_df(rows), lookback=1)
    names = {m.name for m in matches}
    assert "hammer" in names
    assert "doji" not in names


def test_shooting_star_detected():
    rows = [
        {"open": 10.0, "high": 11.0, "low": 9.95, "close": 10.3, "volume": 1000},
    ]
    matches = detect_patterns(_df(rows), lookback=1)
    names = {m.name for m in matches}
    assert "shooting_star" in names
    assert "doji" not in names


def test_doji_detected_and_marked_neutral():
    rows = [
        {"open": 10.0, "high": 10.5, "low": 9.5, "close": 10.02, "volume": 1000},
    ]
    matches = detect_patterns(_df(rows), lookback=1)
    doji = next((m for m in matches if m.name == "doji"), None)
    assert doji is not None
    assert doji.direction == "neutral"


def test_no_pattern_on_ordinary_candle():
    rows = [
        {"open": 10.0, "high": 10.3, "low": 9.8, "close": 10.2, "volume": 1000},
    ]
    matches = detect_patterns(_df(rows), lookback=1)
    assert matches == []


def test_empty_dataframe_returns_empty():
    assert detect_patterns(_df([])) == []


def test_single_bar_still_yields_single_bar_matches():
    # Only one bar exists, so two/three-bar patterns can't be evaluated —
    # but a lone hammer-shaped bar should still be detected.
    rows = [{"open": 10.0, "high": 10.05, "low": 9.0, "close": 9.7, "volume": 1000}]
    matches = detect_patterns(_df(rows), lookback=1)
    assert {m.name for m in matches} == {"hammer"}


def test_matches_are_most_recent_first():
    rows = [
        {"open": 10.0, "high": 10.05, "low": 9.0, "close": 9.95, "volume": 1000},  # hammer, day 0
        {"open": 10.0, "high": 10.1, "low": 9.9, "close": 10.05, "volume": 1000},  # ordinary
        {"open": 10.0, "high": 11.0, "low": 9.95, "close": 10.05, "volume": 1000},  # shooting star, day 2
    ]
    matches = detect_patterns(_df(rows), lookback=3)
    assert matches[0].index == 2
