"""Event-driven backtest engine with realistic execution assumptions.

Walks bar-by-bar (no lookahead: every signal is computed only on data up to
and including the current bar), simulates tiered take-profit exits (40% at
TP1, 30% at TP2, 30% at TP3, stop moved to breakeven after TP1), applies
spread/slippage/partial-fill/halt mechanics from `broker_sim.py`, and forces
a close at the earlier of `max_hold_days` or the end of available data
(modeling delisting/data discontinuation rather than pretending the position
can be held forever).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

from app.services.backtest import broker_sim, metrics
from app.services.backtest.strategy import Signal, simple_momentum_signal
from app.services.data_providers.base import MarketDataProvider
from app.services.features import technical


@dataclass
class BacktestConfig:
    commission_bps: float = 10.0  # 0.10% per fill, each side
    slippage_bps: float = 15.0
    halt_gap_threshold_pct: float = 30.0
    halt_prob_given_gap: float = 0.5
    max_hold_days: int = 20
    position_size_dollars: float = 2000.0
    lookback_window: int = 60
    signal_cooldown_days: int = 5  # avoid re-entering the same name every bar
    start_date: datetime | None = None
    end_date: datetime | None = None


@dataclass
class TradeRecord:
    symbol: str
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp | None
    entry_price: float
    exit_price: float | None
    quantity: float
    pnl_pct: float | None
    exit_reason: str | None
    hold_days: int
    was_partial_entry: bool
    was_halted_entry: bool


@dataclass
class BacktestReport:
    trades: list[TradeRecord]
    equity_curve: list[float]
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown_pct: float
    profit_factor: float
    expectancy_pct: float
    win_rate_pct: float
    avg_hold_time_days: float
    total_return_pct: float
    num_trades: int


def walk_forward_splits(df: pd.DataFrame, n_splits: int = 4, train_ratio: float = 0.7) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    """Rolling walk-forward splits: each fold trains on an expanding/rolling
    window and tests out-of-sample on the immediately following segment.
    """
    n = len(df)
    fold_size = n // n_splits
    splits = []
    for i in range(n_splits):
        fold_start = i * fold_size
        fold_end = min((i + 1) * fold_size, n)
        fold = df.iloc[fold_start:fold_end]
        if len(fold) < 20:
            continue
        split_point = int(len(fold) * train_ratio)
        train, test = fold.iloc[:split_point], fold.iloc[split_point:]
        if len(train) >= 10 and len(test) >= 5:
            splits.append((train, test))
    return splits


class BacktestEngine:
    def __init__(self, config: BacktestConfig | None = None, signal_fn: Callable[[pd.DataFrame], Signal | None] | None = None):
        self.config = config or BacktestConfig()
        self.signal_fn = signal_fn or simple_momentum_signal
        self.rng = np.random.default_rng(42)

    def run(self, provider: MarketDataProvider, symbols: list[str], lookback_days: int = 300) -> BacktestReport:
        all_trades: list[TradeRecord] = []
        for symbol in symbols:
            df = provider.get_ohlcv(symbol, lookback_days=lookback_days)
            df = self._clip_dates(df)
            all_trades.extend(self._run_symbol(symbol, df))

        return self._build_report(all_trades)

    def _clip_dates(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.config.start_date:
            df = df[df.index >= pd.Timestamp(self.config.start_date)]
        if self.config.end_date:
            df = df[df.index <= pd.Timestamp(self.config.end_date)]
        return df

    def _run_symbol(self, symbol: str, df: pd.DataFrame) -> list[TradeRecord]:
        trades: list[TradeRecord] = []
        cfg = self.config
        i = cfg.lookback_window
        cooldown_until = -1

        if len(df) <= cfg.lookback_window:
            return trades

        # Computed once per symbol (all rolling/ewm indicators are causal —
        # row i only ever depends on rows <= i) rather than recomputed on a
        # growing window at every bar, which was O(n^2) per symbol.
        indicator_df = technical.compute_technical_series(df)

        while i < len(df) - 1:
            if i <= cooldown_until:
                i += 1
                continue

            signal = self.signal_fn(indicator_df.iloc[i])
            if signal is None:
                i += 1
                continue

            trade, exit_idx = self._simulate_trade(symbol, df, i, signal)
            trades.append(trade)
            cooldown_until = exit_idx + cfg.signal_cooldown_days
            i = exit_idx + 1

        return trades

    def _simulate_trade(self, symbol: str, df: pd.DataFrame, signal_idx: int, signal: Signal) -> tuple[TradeRecord, int]:
        cfg = self.config
        entry_bar_idx = signal_idx + 1
        if entry_bar_idx >= len(df):
            entry_bar_idx = signal_idx

        entry_bar = df.iloc[entry_bar_idx]
        prev_close = df.iloc[entry_bar_idx - 1]["close"] if entry_bar_idx > 0 else entry_bar["open"]
        gap_pct = (entry_bar["open"] - prev_close) / prev_close * 100 if prev_close else 0.0
        avg_dollar_vol = float((df["close"] * df["volume"]).iloc[max(0, entry_bar_idx - 20) : entry_bar_idx].mean() or 1.0)
        spread_pct = float((entry_bar.get("ask", entry_bar["close"] * 1.01) - entry_bar.get("bid", entry_bar["close"] * 0.99)) / entry_bar["close"] * 100)

        fill = broker_sim.simulate_entry_fill(
            intended_price=signal.entry_price,
            bar_open=entry_bar["open"],
            bar_high=entry_bar["high"],
            bar_low=entry_bar["low"],
            spread_pct=spread_pct,
            slippage_bps=cfg.slippage_bps,
            order_dollar_size=cfg.position_size_dollars,
            bar_dollar_volume=avg_dollar_vol,
            gap_pct=gap_pct,
            rng=self.rng,
            halt_gap_threshold_pct=cfg.halt_gap_threshold_pct,
            halt_prob_given_gap=cfg.halt_prob_given_gap,
        )

        if fill.was_halted or fill.filled_fraction == 0:
            return (
                TradeRecord(
                    symbol=symbol,
                    entry_ts=df.index[entry_bar_idx],
                    exit_ts=df.index[entry_bar_idx],
                    entry_price=signal.entry_price,
                    exit_price=None,
                    quantity=0.0,
                    pnl_pct=0.0,
                    exit_reason="halted_no_fill" if fill.was_halted else "no_fill",
                    hold_days=0,
                    was_partial_entry=False,
                    was_halted_entry=fill.was_halted,
                ),
                entry_bar_idx,
            )

        entry_price = fill.fill_price * (1 + cfg.commission_bps / 10_000)
        quantity = (cfg.position_size_dollars * fill.filled_fraction) / entry_price

        remaining = 1.0
        stop = signal.stop_loss
        blended_exit_value = 0.0
        exit_reason = "timeout"
        exit_ts = df.index[min(entry_bar_idx + cfg.max_hold_days, len(df) - 1)]
        exit_idx = min(entry_bar_idx + cfg.max_hold_days, len(df) - 1)

        tiers = [(0.4, signal.take_profit_1), (0.3, signal.take_profit_2), (0.3, signal.take_profit_3)]
        tier_hit = [False, False, False]

        j = entry_bar_idx + 1
        last_bar_idx = min(entry_bar_idx + cfg.max_hold_days, len(df) - 1)
        while j <= last_bar_idx:
            bar = df.iloc[j]
            bar_spread_pct = float((bar.get("ask", bar["close"] * 1.01) - bar.get("bid", bar["close"] * 0.99)) / bar["close"] * 100)

            for t_idx, (fraction, target) in enumerate(tiers):
                if tier_hit[t_idx] or remaining <= 0:
                    continue
                result = broker_sim.simulate_exit_fill(target, stop, bar["open"], bar["high"], bar["low"], bar_spread_pct, cfg.slippage_bps)
                if result is not None:
                    fill_price, reason = result
                    if reason == "stop":
                        blended_exit_value += remaining * fill_price
                        remaining = 0.0
                        exit_reason = "stop"
                        exit_idx = j
                        exit_ts = df.index[j]
                        break
                    else:
                        blended_exit_value += fraction * fill_price
                        remaining -= fraction
                        tier_hit[t_idx] = True
                        exit_reason = f"tp{t_idx + 1}"
                        exit_idx = j
                        exit_ts = df.index[j]
                        if t_idx == 0:
                            stop = max(stop, entry_price)  # move to breakeven after TP1

            if remaining <= 0:
                break
            j += 1

        if remaining > 0:
            final_bar = df.iloc[last_bar_idx]
            blended_exit_value += remaining * final_bar["close"] * (1 - cfg.commission_bps / 10_000)
            exit_reason = exit_reason if exit_reason != "timeout" else "timeout"
            exit_idx = last_bar_idx
            exit_ts = df.index[last_bar_idx]

        pnl_pct = (blended_exit_value - entry_price) / entry_price * 100
        hold_days = exit_idx - entry_bar_idx

        return (
            TradeRecord(
                symbol=symbol,
                entry_ts=df.index[entry_bar_idx],
                exit_ts=exit_ts,
                entry_price=float(entry_price),
                exit_price=float(blended_exit_value),
                quantity=float(quantity),
                pnl_pct=float(pnl_pct),
                exit_reason=exit_reason,
                hold_days=int(hold_days),
                was_partial_entry=fill.was_partial,
                was_halted_entry=False,
            ),
            exit_idx,
        )

    def _build_report(self, trades: list[TradeRecord]) -> BacktestReport:
        valid_trades = [t for t in trades if t.pnl_pct is not None and t.exit_reason not in ("no_fill", "halted_no_fill")]
        pnl_array = np.array([t.pnl_pct for t in valid_trades]) if valid_trades else np.array([])
        hold_days = np.array([t.hold_days for t in valid_trades]) if valid_trades else np.array([])

        equity = [10_000.0]
        for pnl in pnl_array:
            equity.append(equity[-1] * (1 + pnl / 100 * 0.1))  # 10% of equity risked per trade unit
        equity_arr = np.array(equity)

        daily_returns = pnl_array / 100 if len(pnl_array) else np.array([0.0])

        return BacktestReport(
            trades=trades,
            equity_curve=equity_arr.tolist(),
            sharpe_ratio=metrics.sharpe_ratio(daily_returns),
            sortino_ratio=metrics.sortino_ratio(daily_returns),
            max_drawdown_pct=metrics.max_drawdown_pct(equity_arr),
            profit_factor=metrics.profit_factor(pnl_array),
            expectancy_pct=metrics.expectancy(pnl_array),
            win_rate_pct=metrics.win_rate(pnl_array),
            avg_hold_time_days=metrics.avg_hold_time(hold_days),
            total_return_pct=float((equity_arr[-1] / equity_arr[0] - 1) * 100) if len(equity_arr) > 1 else 0.0,
            num_trades=len(valid_trades),
        )
