"""Incremental (per-tick) indicator engine, v1.

Live streams must not recompute full history per tick (spec: performance).
These are O(1)-per-update implementations of the v1 indicator subset, each
declaring name/params/version/required history and a warm-up flag —
signals are forbidden until warm (tested). Batch equivalence against the
vectorized engine in `features/technical.py` is unit-tested to 1e-6.

INDICATOR_ENGINE_VERSION stamps every emitted snapshot; bump on any
formula change so drift between stored snapshots is attributable.
"""
from __future__ import annotations

from dataclasses import dataclass

INDICATOR_ENGINE_VERSION = "inc-1.0.0"


@dataclass
class IndicatorValue:
    name: str
    params: dict
    value: float | None
    warm: bool
    required_history: int
    version: str = INDICATOR_ENGINE_VERSION


class IncrementalEMA:
    def __init__(self, span: int):
        self.span = span
        self.alpha = 2 / (span + 1)
        self.value: float | None = None
        self.count = 0

    def update(self, price: float) -> IndicatorValue:
        self.count += 1
        self.value = price if self.value is None else (price - self.value) * self.alpha + self.value
        return IndicatorValue("ema", {"span": self.span}, self.value, self.count >= self.span, self.span)


class IncrementalRSI:
    """Wilder's RSI, O(1) per bar close."""

    def __init__(self, period: int = 14):
        self.period = period
        self.prev: float | None = None
        self.avg_gain = 0.0
        self.avg_loss = 0.0
        self.count = 0

    def update(self, close: float) -> IndicatorValue:
        if self.prev is None:
            self.prev = close
            return IndicatorValue("rsi", {"period": self.period}, None, False, self.period + 1)
        change = close - self.prev
        gain, loss = max(change, 0.0), max(-change, 0.0)
        self.count += 1
        if self.count <= self.period:
            self.avg_gain += gain / self.period
            self.avg_loss += loss / self.period
        else:
            self.avg_gain = (self.avg_gain * (self.period - 1) + gain) / self.period
            self.avg_loss = (self.avg_loss * (self.period - 1) + loss) / self.period
        self.prev = close
        warm = self.count >= self.period
        value = None
        if warm:
            value = 100.0 if self.avg_loss == 0 else 100 - 100 / (1 + self.avg_gain / self.avg_loss)
        return IndicatorValue("rsi", {"period": self.period}, value, warm, self.period + 1)


class SessionVWAP:
    """Session-anchored VWAP over streamed trades."""

    def __init__(self):
        self.pv = 0.0
        self.vol = 0.0

    def update(self, price: float, volume: float) -> IndicatorValue:
        self.pv += price * volume
        self.vol += volume
        value = self.pv / self.vol if self.vol > 0 else None
        return IndicatorValue("vwap", {"anchor": "session"}, value, self.vol > 0, 1)


class LiveIndicatorSet:
    """The v1 live set: EMA9/EMA20 on bar closes, RSI14 on bar closes,
    session VWAP on trades. `snapshot()` reports values + warm-up state;
    `all_warm` gates signal generation.
    """

    def __init__(self):
        self.ema9 = IncrementalEMA(9)
        self.ema20 = IncrementalEMA(20)
        self.rsi14 = IncrementalRSI(14)
        self.vwap = SessionVWAP()
        self._latest: dict[str, IndicatorValue] = {}

    def on_trade(self, price: float, volume: float) -> None:
        self._latest["vwap"] = self.vwap.update(price, volume)

    def on_bar_close(self, close: float) -> None:
        self._latest["ema9"] = self.ema9.update(close)
        self._latest["ema20"] = self.ema20.update(close)
        self._latest["rsi14"] = self.rsi14.update(close)

    @property
    def all_warm(self) -> bool:
        needed = {"ema9", "ema20", "rsi14"}
        return needed.issubset(self._latest) and all(self._latest[k].warm for k in needed)

    def snapshot(self) -> dict:
        return {
            name: {
                "value": iv.value, "warm": iv.warm, "params": iv.params,
                "required_history": iv.required_history, "version": iv.version,
            }
            for name, iv in self._latest.items()
        }
