"""Phase 2 — multi-horizon labels.

Seven genuinely separate horizons, each its own dataset (never mixed into
one ambiguous target): intraday 30-minute, intraday 60-minute, end-of-day
(entry intraday, forced exit at that same session's close), 1/5/10/20
trading days (close-to-close, daily bars). Day-trading horizons (30m,
60m, eod) never let a position roll past that session's regular-hours
close — the label generator simply has no bar to exit into after the
session ends, so the last few bars of every session are excluded rather
than allowed to spill into the next day. Swing horizons (1d/5d/10d/20d)
hold for exactly their own horizon, which IS their maximum holding
period (a swing horizon does not exit early on its own — Phase 6's
Canary engine layers stop-loss/take-profit on top of this at execution
time, but the *label* itself is a plain forward return at that horizon).

The label itself is never used as an input feature anywhere in this
pipeline — see services/research/features.py, which only ever reads bars
up to and including the entry timestamp, strictly before this module's
`exit_ts`.

Neutral zone: sized to cover an estimated round-trip cost (spread +
slippage, tighter for short intraday horizons, wider for longer swings
where noise dominates) plus a genuine no-signal buffer, per horizon —
fixed constants, not fit to any period's data (fitting the neutral zone
to historical returns would itself be a leakage/overfitting vector).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

HORIZONS = ("30m", "60m", "eod", "1d", "5d", "10d", "20d")
INTRADAY_HORIZONS = ("30m", "60m", "eod")
SWING_HORIZONS = ("1d", "5d", "10d", "20d")
SWING_HORIZON_DAYS = {"1d": 1, "5d": 5, "10d": 10, "20d": 20}

# Percent, one-sided (a move must exceed +zone to label BUY, or be more
# negative than -zone to label SELL). See module docstring for rationale.
NEUTRAL_ZONE_PCT = {
    "30m": 0.15, "60m": 0.20, "eod": 0.25,
    "1d": 0.35, "5d": 0.75, "10d": 1.25, "20d": 2.0,
}

_ET = ZoneInfo("America/New_York")


@dataclass
class LabeledSample:
    ticker_symbol: str
    horizon: str
    entry_ts: datetime
    entry_price: float
    exit_ts: datetime
    exit_price: float
    forward_return_pct: float
    label: str  # BUY | SELL | NO_TRADE

    @property
    def is_buy(self) -> int:
        return int(self.label == "BUY")

    @property
    def is_sell(self) -> int:
        return int(self.label == "SELL")


def _label_from_return(forward_return_pct: float, horizon: str) -> str:
    zone = NEUTRAL_ZONE_PCT[horizon]
    if forward_return_pct > zone:
        return "BUY"
    if forward_return_pct < -zone:
        return "SELL"
    return "NO_TRADE"


def label_swing_horizon(df: pd.DataFrame, ticker_symbol: str, horizon: str) -> list[LabeledSample]:
    """`df`: daily bars (timeframe="1d"), DatetimeIndex ascending UTC,
    columns open/high/low/close/volume. Close-to-close forward return,
    `SWING_HORIZON_DAYS[horizon]` trading days ahead — never calendar
    days, so weekends/holidays don't silently shrink the real holding
    window."""
    if horizon not in SWING_HORIZONS:
        raise ValueError(f"{horizon} is not a swing horizon")
    horizon_days = SWING_HORIZON_DAYS[horizon]
    samples: list[LabeledSample] = []
    n = len(df)
    for i in range(n - horizon_days):
        entry_price = float(df["close"].iloc[i])
        exit_price = float(df["close"].iloc[i + horizon_days])
        if entry_price <= 0:
            continue
        forward_return_pct = (exit_price / entry_price - 1) * 100
        samples.append(LabeledSample(
            ticker_symbol, horizon, df.index[i].to_pydatetime(), entry_price,
            df.index[i + horizon_days].to_pydatetime(), exit_price, forward_return_pct,
            _label_from_return(forward_return_pct, horizon),
        ))
    return samples


def label_eod_horizon(df: pd.DataFrame, ticker_symbol: str) -> list[LabeledSample]:
    """`df`: intraday bars (any resolution — 30m recommended for
    coverage), REGULAR SESSION ONLY (callers must pre-filter
    `session == "regular"`; this function trusts that filter rather than
    re-deriving it, so it stays agnostic to timeframe). Entry at any bar
    except the session's last, forced exit at that same session's final
    bar close — by construction this can never roll into the next day.
    """
    samples: list[LabeledSample] = []
    et_dates = df.index.tz_convert(_ET).date
    for day in sorted(set(et_dates)):
        group = df[et_dates == day].sort_index()
        if len(group) < 2:
            continue
        exit_price = float(group["close"].iloc[-1])
        exit_ts = group.index[-1]
        for i in range(len(group) - 1):
            entry_price = float(group["close"].iloc[i])
            if entry_price <= 0:
                continue
            forward_return_pct = (exit_price / entry_price - 1) * 100
            samples.append(LabeledSample(
                ticker_symbol, "eod", group.index[i].to_pydatetime(), entry_price,
                exit_ts.to_pydatetime(), exit_price, forward_return_pct,
                _label_from_return(forward_return_pct, "eod"),
            ))
    return samples


def label_intraday_horizon(df: pd.DataFrame, ticker_symbol: str, horizon: str) -> list[LabeledSample]:
    """`df`: intraday bars at the SAME resolution as `horizon` (30m bars
    for horizon="30m", 60m bars for horizon="60m"), REGULAR SESSION ONLY.
    Exit is exactly one bar forward — never crossing a session boundary,
    since entry/exit are both drawn from the same day's group."""
    if horizon not in ("30m", "60m"):
        raise ValueError(f"{horizon} is not a one-bar-forward intraday horizon")
    samples: list[LabeledSample] = []
    et_dates = df.index.tz_convert(_ET).date
    for day in sorted(set(et_dates)):
        group = df[et_dates == day].sort_index()
        n = len(group)
        for i in range(n - 1):
            entry_price = float(group["close"].iloc[i])
            exit_price = float(group["close"].iloc[i + 1])
            if entry_price <= 0:
                continue
            forward_return_pct = (exit_price / entry_price - 1) * 100
            samples.append(LabeledSample(
                ticker_symbol, horizon, group.index[i].to_pydatetime(), entry_price,
                group.index[i + 1].to_pydatetime(), exit_price, forward_return_pct,
                _label_from_return(forward_return_pct, horizon),
            ))
    return samples


def label_horizon(df: pd.DataFrame, ticker_symbol: str, horizon: str) -> list[LabeledSample]:
    """Dispatches to the right labeler for any of the 7 HORIZONS. `df`
    must already be the correct bar resolution/session-filter for that
    horizon (daily for swing horizons; regular-session-only 30m/60m bars
    for intraday ones) — see each specific function's own docstring."""
    if horizon in SWING_HORIZONS:
        return label_swing_horizon(df, ticker_symbol, horizon)
    if horizon == "eod":
        return label_eod_horizon(df, ticker_symbol)
    return label_intraday_horizon(df, ticker_symbol, horizon)
