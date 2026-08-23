"""Support/resistance fractal detection — uses a hand-built series with a
known, repeated ceiling and floor so the clustering/strength math is
checked against a known-correct answer, not just "it returns something"."""
import numpy as np
import pandas as pd

from app.services.features.levels import detect_support_resistance, find_swing_points


def _sawtooth(n: int = 60, low: float = 9.0, high: float = 11.0) -> pd.DataFrame:
    """Bounces between `low` and `high` repeatedly — real, deterministic
    swing highs at ~`high` and swing lows at ~`low` on every cycle."""
    idx = pd.date_range("2025-01-01", periods=n, freq="D", tz="UTC")
    t = np.arange(n)
    mid = (low + high) / 2
    amp = (high - low) / 2
    # A tiny deterministic per-step jitter breaks the exact float ties a
    # perfectly periodic sine would otherwise produce at every peak/trough
    # (two neighboring samples landing on bit-identical values, which is a
    # sawtooth-fixture artifact, not something real price data ever does) —
    # without it, the strict-unique-max swing check rejects every peak.
    jitter = np.sin(t * 7.3105) * 1e-4
    closes = mid + amp * np.sin(t * (2 * np.pi / 10)) + jitter
    highs = closes + 0.05
    lows = closes - 0.05
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": 1_000_000.0},
        index=idx,
    )


def test_swing_points_found_at_local_extremes():
    df = _sawtooth()
    swing_highs, swing_lows = find_swing_points(df, k=3)
    assert len(swing_highs) >= 3
    assert len(swing_lows) >= 3
    # Every detected swing high really is a local max over its window.
    for i in swing_highs:
        window = df["high"].iloc[max(0, i - 3) : i + 4]
        assert df["high"].iloc[i] == window.max()


def test_repeated_ceiling_clusters_into_one_resistance_level():
    df = _sawtooth()
    levels = detect_support_resistance(df, k=3, tolerance_pct=1.5)
    resistance = [lv for lv in levels if lv.kind == "resistance"]
    assert resistance, "expected at least one resistance zone"
    top = max(resistance, key=lambda lv: lv.touches)
    assert top.touches >= 2  # the repeated ~11.0 ceiling was touched more than once
    assert 10.5 < top.price < 11.5


def test_too_short_series_yields_no_levels():
    df = _sawtooth(n=5)
    assert detect_support_resistance(df, k=3) == []


def test_levels_sorted_strongest_first():
    df = _sawtooth(n=120)
    levels = detect_support_resistance(df, k=3, max_levels=10)
    strengths = [lv.strength for lv in levels]
    assert strengths == sorted(strengths, reverse=True)


def test_max_levels_is_respected():
    df = _sawtooth(n=200)
    levels = detect_support_resistance(df, k=2, tolerance_pct=0.5, max_levels=3)
    assert len(levels) <= 3
