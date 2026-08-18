"""Deterministic candlestick pattern detection.

Every pattern here is a fixed, documented numeric rule over real OHLC data —
nothing is inferred by an LLM and nothing is invented when a bar doesn't
qualify (a bar simply produces no match). Used by the AI Signals indicator
as one of several real evidence sources, never as a standalone signal.

All detectors are causal: a match at bar `i` only inspects bars `<= i`, so
this is safe to run over the tail of a live-updating series without
lookahead (same discipline as `technical.compute_technical_series`).
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

BULLISH = "bullish"
BEARISH = "bearish"


@dataclass
class PatternMatch:
    name: str
    index: int  # positional index into the source DataFrame
    timestamp: pd.Timestamp
    direction: str  # "bullish" | "bearish"
    reason: str


def _body(row) -> float:
    return abs(row["close"] - row["open"])


def _range(row) -> float:
    return max(row["high"] - row["low"], 1e-9)


def _upper_wick(row) -> float:
    return row["high"] - max(row["open"], row["close"])


def _lower_wick(row) -> float:
    return min(row["open"], row["close"]) - row["low"]


def _is_doji(row) -> bool:
    # Deliberately tighter than the "small body" hammer/shooting-star
    # threshold below — a doji's body is virtually zero, not just small,
    # so the two categories don't overlap on an ordinary small-bodied bar.
    return _body(row) <= 0.05 * _range(row)


def _is_hammer(row) -> bool:
    body = _body(row)
    rng = _range(row)
    return (
        _lower_wick(row) >= 2 * body
        and _upper_wick(row) <= 0.5 * body
        and (min(row["open"], row["close"]) - row["low"]) / rng >= 0.5  # body sits in the upper half
    )


def _is_shooting_star(row) -> bool:
    body = _body(row)
    rng = _range(row)
    return (
        _upper_wick(row) >= 2 * body
        and _lower_wick(row) <= 0.5 * body
        and (row["high"] - max(row["open"], row["close"])) / rng >= 0.5  # body sits in the lower half
    )


def _is_bullish_engulfing(prev, cur) -> bool:
    return (
        prev["close"] < prev["open"]  # prior bar bearish
        and cur["close"] > cur["open"]  # current bar bullish
        and cur["open"] <= prev["close"]
        and cur["close"] >= prev["open"]
    )


def _is_bearish_engulfing(prev, cur) -> bool:
    return (
        prev["close"] > prev["open"]  # prior bar bullish
        and cur["close"] < cur["open"]  # current bar bearish
        and cur["open"] >= prev["close"]
        and cur["close"] <= prev["open"]
    )


def _is_morning_star(a, b, c) -> bool:
    """3-bar bullish reversal: big bearish bar, small-bodied middle bar
    gapping down, bullish bar closing back into the first bar's body."""
    return (
        a["close"] < a["open"]
        and _body(a) > _range(a) * 0.5
        and _body(b) <= _range(b) * 0.35
        and max(b["open"], b["close"]) < a["close"]
        and c["close"] > c["open"]
        and c["close"] >= (a["open"] + a["close"]) / 2
    )


def _is_evening_star(a, b, c) -> bool:
    return (
        a["close"] > a["open"]
        and _body(a) > _range(a) * 0.5
        and _body(b) <= _range(b) * 0.35
        and min(b["open"], b["close"]) > a["close"]
        and c["close"] < c["open"]
        and c["close"] <= (a["open"] + a["close"]) / 2
    )


_SINGLE_BAR = {
    "doji": (lambda r: _is_doji(r), "neutral-reversal — open/close nearly equal, indecision"),
    "hammer": (lambda r: _is_hammer(r), "bullish reversal — long lower wick rejects lower prices"),
    "shooting_star": (lambda r: _is_shooting_star(r), "bearish reversal — long upper wick rejects higher prices"),
}

_TWO_BAR = {
    "bullish_engulfing": (_is_bullish_engulfing, BULLISH, "current candle fully engulfs the prior bearish candle"),
    "bearish_engulfing": (_is_bearish_engulfing, BEARISH, "current candle fully engulfs the prior bullish candle"),
}

_THREE_BAR = {
    "morning_star": (_is_morning_star, BULLISH, "three-bar bottoming reversal (large down, indecision, large up)"),
    "evening_star": (_is_evening_star, BEARISH, "three-bar topping reversal (large up, indecision, large down)"),
}


def detect_patterns(df: pd.DataFrame, lookback: int = 5) -> list[PatternMatch]:
    """Scan the last `lookback` bars for pattern matches, most recent first.
    Doji has no inherent direction on its own — reported neutral and left
    for the caller to weigh alongside trend context; it is never treated as
    a bullish or bearish signal by itself. Multi-bar patterns are simply
    skipped for bars too early in the series to have the prior context they
    need — a short series still yields whatever single-bar matches it can."""
    if len(df) == 0:
        return []
    matches: list[PatternMatch] = []
    start = max(0, len(df) - lookback)
    for i in range(start, len(df)):
        cur = df.iloc[i]
        ts = df.index[i]

        for name, (fn, reason) in _SINGLE_BAR.items():
            if fn(cur):
                direction = BULLISH if name == "hammer" else BEARISH if name == "shooting_star" else "neutral"
                matches.append(PatternMatch(name, i, ts, direction, reason))

        if i >= 1:
            prev = df.iloc[i - 1]
            for name, (two_bar_fn, direction, reason) in _TWO_BAR.items():
                if two_bar_fn(prev, cur):
                    matches.append(PatternMatch(name, i, ts, direction, reason))

        if i >= 2:
            a, b = df.iloc[i - 2], df.iloc[i - 1]
            for name, (three_bar_fn, direction, reason) in _THREE_BAR.items():
                if three_bar_fn(a, b, cur):
                    matches.append(PatternMatch(name, i, ts, direction, reason))

    return list(reversed(matches))
