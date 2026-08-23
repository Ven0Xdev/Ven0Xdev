"""Lightweight time-series forecasting for expected-move sizing.

Uses an EWMA-volatility random-walk-with-drift model to project a return
distribution over the requested horizon. This intentionally is not a
transformer/deep model in this environment (no GPU, no historical training
corpus at that scale) — the interface (`forecast_horizon_distribution`) is
where a trained sequence model (temporal fusion transformer / N-BEATS,
see `services/ml/text_model.py` for the analogous text-model plug point)
would be swapped in for production, without touching callers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def forecast_horizon_distribution(df: pd.DataFrame, horizon_days: int, n_sims: int = 2000, seed: int = 7) -> dict:
    close = df["close"]
    log_returns = np.log(close / close.shift(1)).dropna()
    if len(log_returns) < 10:
        return {"expected_return_pct": 0.0, "std_pct": 5.0, "downside_prob": 0.5}

    mu = float(log_returns.ewm(span=20).mean().iloc[-1])
    sigma = float(log_returns.ewm(span=20).std().iloc[-1]) or float(log_returns.std())

    rng = np.random.default_rng(seed)
    sims = rng.normal(mu, sigma, size=(n_sims, horizon_days))
    cum_returns = np.exp(sims.cumsum(axis=1))[:, -1] - 1

    downside_before_upside = _prob_downside_before_upside(mu, sigma, horizon_days, rng, n_sims)

    return {
        "expected_return_pct": float(np.mean(cum_returns) * 100),
        "median_return_pct": float(np.median(cum_returns) * 100),
        "std_pct": float(np.std(cum_returns) * 100),
        "p10_pct": float(np.percentile(cum_returns, 10) * 100),
        "p90_pct": float(np.percentile(cum_returns, 90) * 100),
        "downside_prob": downside_before_upside,
    }


def probability_of_touching_threshold(df: pd.DataFrame, horizon_days: int, threshold_pct: float, n_sims: int = 2000, seed: int = 11) -> float:
    """Monte-Carlo probability that price touches +threshold_pct at any point
    within horizon_days (barrier probability — matches how a trader actually
    experiences a take-profit level, not just the terminal return).
    """
    close = df["close"]
    log_returns = np.log(close / close.shift(1)).dropna()
    if len(log_returns) < 10:
        return 0.3

    mu = float(log_returns.ewm(span=20).mean().iloc[-1])
    sigma = float(log_returns.ewm(span=20).std().iloc[-1]) or float(log_returns.std())

    rng = np.random.default_rng(seed)
    daily = rng.normal(mu, sigma, size=(n_sims, horizon_days))
    paths = np.exp(daily.cumsum(axis=1))
    touched = (paths >= (1 + threshold_pct / 100)).any(axis=1)
    return float(touched.mean())


def _prob_downside_before_upside(mu: float, sigma: float, horizon_days: int, rng: np.random.Generator, n_sims: int) -> float:
    """Monte-Carlo estimate of P(path dips below entry before it first gains 5%).

    Vectorized: argmax over a boolean mask gives the first True index per row
    (or 0 if none are True), so `n_sims` first-touch indices are computed in
    one numpy call instead of a Python-level loop over each simulated path.
    """
    daily = rng.normal(mu, sigma, size=(n_sims, horizon_days))
    paths = np.exp(daily.cumsum(axis=1))
    down_mask = paths <= 0.97
    up_mask = paths >= 1.05
    hits_down = down_mask.any(axis=1)
    hits_up = up_mask.any(axis=1)

    down_idx = np.where(hits_down, down_mask.argmax(axis=1), horizon_days)
    up_idx = np.where(hits_up, up_mask.argmax(axis=1), horizon_days)

    down_first = np.sum((down_idx < up_idx) & hits_down)
    return float(down_first / n_sims)
