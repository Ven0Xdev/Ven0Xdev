from __future__ import annotations

import numpy as np


def sharpe_ratio(returns: np.ndarray, risk_free_rate: float = 0.0, periods_per_year: int = 252) -> float:
    returns = np.asarray(returns)
    if len(returns) < 2 or returns.std() == 0:
        return 0.0
    excess = returns - risk_free_rate / periods_per_year
    return float(np.mean(excess) / np.std(excess, ddof=1) * np.sqrt(periods_per_year))


def sortino_ratio(returns: np.ndarray, risk_free_rate: float = 0.0, periods_per_year: int = 252) -> float:
    returns = np.asarray(returns)
    if len(returns) < 2:
        return 0.0
    excess = returns - risk_free_rate / periods_per_year
    downside = excess[excess < 0]
    downside_std = downside.std(ddof=1) if len(downside) > 1 else 1e-9
    if downside_std == 0:
        downside_std = 1e-9
    return float(np.mean(excess) / downside_std * np.sqrt(periods_per_year))


def max_drawdown_pct(equity_curve: np.ndarray) -> float:
    equity_curve = np.asarray(equity_curve)
    if len(equity_curve) == 0:
        return 0.0
    running_max = np.maximum.accumulate(equity_curve)
    drawdown = (equity_curve - running_max) / running_max
    return float(drawdown.min() * 100)


def profit_factor(trade_pnls: np.ndarray) -> float:
    trade_pnls = np.asarray(trade_pnls)
    gains = trade_pnls[trade_pnls > 0].sum()
    losses = -trade_pnls[trade_pnls < 0].sum()
    if losses == 0:
        return float(gains) if gains > 0 else 0.0
    return float(gains / losses)


def expectancy(trade_pnls_pct: np.ndarray) -> float:
    trade_pnls_pct = np.asarray(trade_pnls_pct)
    if len(trade_pnls_pct) == 0:
        return 0.0
    wins = trade_pnls_pct[trade_pnls_pct > 0]
    losses = trade_pnls_pct[trade_pnls_pct <= 0]
    win_rate = len(wins) / len(trade_pnls_pct)
    avg_win = wins.mean() if len(wins) else 0.0
    avg_loss = losses.mean() if len(losses) else 0.0
    return float(win_rate * avg_win + (1 - win_rate) * avg_loss)


def win_rate(trade_pnls_pct: np.ndarray) -> float:
    trade_pnls_pct = np.asarray(trade_pnls_pct)
    if len(trade_pnls_pct) == 0:
        return 0.0
    return float((trade_pnls_pct > 0).mean() * 100)


def avg_hold_time(hold_days: np.ndarray) -> float:
    hold_days = np.asarray(hold_days)
    return float(hold_days.mean()) if len(hold_days) else 0.0
