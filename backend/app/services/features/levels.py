"""Support/resistance detection via fractal swing points.

A bar is a swing high/low when it's a strict local extreme over a symmetric
window — the standard, deterministic "fractal" definition, not a fitted or
learned level. Nearby swing prices are clustered into zones; a zone's
strength is its touch count, so a level real price action has tested
repeatedly outranks a level only ever touched once. Nothing here is
inferred beyond the real OHLC series — an instrument with too little
history simply yields fewer (or zero) levels.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class Level:
    price: float
    kind: str  # "support" | "resistance"
    touches: int
    strength: float  # 0-100, touches weighted by recency
    first_seen: pd.Timestamp
    last_seen: pd.Timestamp


def find_swing_points(df: pd.DataFrame, k: int = 3) -> tuple[list[int], list[int]]:
    """Positional indices of swing highs and swing lows: bar i qualifies
    when its high/low strictly exceeds every bar within k positions on
    both sides (needs the full window on both sides, so the most recent
    k bars can never be confirmed swing points yet — same causal-lag
    tradeoff any fractal indicator has)."""
    highs, lows = df["high"].to_numpy(), df["low"].to_numpy()
    n = len(df)
    swing_highs, swing_lows = [], []
    for i in range(k, n - k):
        window_h = highs[i - k : i + k + 1]
        if highs[i] == window_h.max() and (window_h == highs[i]).sum() == 1:
            swing_highs.append(i)
        window_l = lows[i - k : i + k + 1]
        if lows[i] == window_l.min() and (window_l == lows[i]).sum() == 1:
            swing_lows.append(i)
    return swing_highs, swing_lows


def _cluster(df: pd.DataFrame, indices: list[int], prices, kind: str, tolerance_pct: float) -> list[Level]:
    if not indices:
        return []
    points = sorted((float(prices.iloc[i]), i) for i in indices)
    clusters: list[list[tuple[float, int]]] = []
    for price, idx in points:
        if clusters and abs(price - clusters[-1][-1][0]) / clusters[-1][-1][0] * 100 <= tolerance_pct:
            clusters[-1].append((price, idx))
        else:
            clusters.append([(price, idx)])

    n = len(df)
    levels = []
    for cluster in clusters:
        avg_price = sum(p for p, _ in cluster) / len(cluster)
        touches = len(cluster)
        # Recency weighting: a touch near the end of the series counts more
        # than one from deep history — the level is more likely still live.
        recency = sum((i / max(n - 1, 1)) for _, i in cluster) / touches
        strength = min(100.0, touches * 18.0 * (0.5 + 0.5 * recency))
        idxs = [i for _, i in cluster]
        levels.append(
            Level(
                price=round(avg_price, 6),
                kind=kind,
                touches=touches,
                strength=round(strength, 1),
                first_seen=df.index[min(idxs)],
                last_seen=df.index[max(idxs)],
            )
        )
    return levels


def detect_support_resistance(
    df: pd.DataFrame, k: int = 3, tolerance_pct: float = 1.5, max_levels: int = 6
) -> list[Level]:
    """Real, clustered support/resistance zones from swing points, strongest
    first. Support levels are built from swing lows, resistance from swing
    highs — deliberately not cross-mixed, since a zone that only ever
    capped price (resistance) is a different claim than one that only ever
    held price up (support)."""
    if len(df) < (2 * k + 1):
        return []
    swing_highs, swing_lows = find_swing_points(df, k=k)
    resistance = _cluster(df, swing_highs, df["high"], "resistance", tolerance_pct)
    support = _cluster(df, swing_lows, df["low"], "support", tolerance_pct)
    levels = sorted(resistance + support, key=lambda lv: lv.strength, reverse=True)
    return levels[:max_levels]
