"""Realistic OTC execution simulation: spread cost, slippage, partial fills,
and trading halts. OTC micro-caps regularly gap 30-100%+ intraday and are
frequently halted for "additional information requested" — a backtest that
ignores this wildly overstates strategy performance.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class FillResult:
    fill_price: float
    filled_fraction: float  # 0..1 of intended size actually filled
    was_halted: bool
    was_partial: bool


def simulate_entry_fill(
    intended_price: float,
    bar_open: float,
    bar_high: float,
    bar_low: float,
    spread_pct: float,
    slippage_bps: float,
    order_dollar_size: float,
    bar_dollar_volume: float,
    gap_pct: float,
    rng: np.random.Generator,
    halt_gap_threshold_pct: float = 30.0,
    halt_prob_given_gap: float = 0.5,
) -> FillResult:
    was_halted = bool(abs(gap_pct) >= halt_gap_threshold_pct and rng.random() < halt_prob_given_gap)
    if was_halted:
        return FillResult(fill_price=bar_open, filled_fraction=0.0, was_halted=True, was_partial=False)

    if not (bar_low <= intended_price <= bar_high) and intended_price < bar_low:
        # Price never traded down to the limit price this bar.
        return FillResult(fill_price=intended_price, filled_fraction=0.0, was_halted=False, was_partial=False)

    half_spread = spread_pct / 200
    slippage = slippage_bps / 10_000
    fill_price = intended_price * (1 + half_spread + slippage)
    fill_price = min(fill_price, bar_high)

    participation = order_dollar_size / max(bar_dollar_volume, 1.0)
    if participation > 0.10:
        filled_fraction = float(np.clip(0.10 / participation, 0.15, 1.0))
        was_partial = filled_fraction < 0.999
    else:
        filled_fraction = 1.0
        was_partial = False

    return FillResult(fill_price=float(fill_price), filled_fraction=filled_fraction, was_halted=False, was_partial=was_partial)


def simulate_exit_fill(
    target_price: float,
    stop_price: float,
    bar_open: float,
    bar_high: float,
    bar_low: float,
    spread_pct: float,
    slippage_bps: float,
) -> tuple[float, str] | None:
    """Returns (fill_price, reason) for whichever of stop/target is hit first
    this bar, preferring the stop if both are touched (conservative
    assumption — we can't know intrabar sequencing from daily OHLC).
    """
    half_spread = spread_pct / 200
    slippage = slippage_bps / 10_000

    if bar_low <= stop_price:
        fill = min(stop_price, bar_open) * (1 - half_spread - slippage) if bar_open < stop_price else stop_price * (1 - half_spread - slippage)
        return float(fill), "stop"
    if bar_high >= target_price:
        fill = target_price * (1 - half_spread - slippage)
        return float(fill), "target"
    return None
