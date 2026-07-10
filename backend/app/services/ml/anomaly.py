"""Statistical anomaly detection over price/volume behavior.

Complements the rule-based manipulation flags in `services/features/manipulation.py`
with an unsupervised IsolationForest over a rolling window of return/volume
statistics, catching manipulation patterns that don't match a hand-written
rule but still look statistically abnormal versus the stock's own history
and versus the broader OTC universe.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _rolling_stat_matrix(df: pd.DataFrame, window: int = 10) -> np.ndarray:
    returns = df["close"].pct_change()
    vol_ratio = df["volume"] / df["volume"].rolling(window, min_periods=1).mean().replace(0, np.nan)
    intraday_range = (df["high"] - df["low"]) / df["close"].replace(0, np.nan)

    features = pd.DataFrame(
        {
            "ret_mean": returns.rolling(window, min_periods=2).mean(),
            "ret_std": returns.rolling(window, min_periods=2).std(),
            "ret_skew": returns.rolling(window, min_periods=3).skew(),
            "vol_ratio_mean": vol_ratio.rolling(window, min_periods=2).mean(),
            "vol_ratio_max": vol_ratio.rolling(window, min_periods=2).max(),
            "range_mean": intraday_range.rolling(window, min_periods=2).mean(),
        }
    ).fillna(0.0)
    return features.to_numpy()


def compute_anomaly_score(df: pd.DataFrame, window: int = 10) -> tuple[float, dict]:
    """Returns (0-100 anomaly score for the latest bar, diagnostic dict)."""
    if len(df) < window * 2:
        return 0.0, {"reason": "insufficient_history"}

    matrix = _rolling_stat_matrix(df, window)
    try:
        from sklearn.ensemble import IsolationForest

        clf = IsolationForest(n_estimators=150, contamination=0.1, random_state=42)
        clf.fit(matrix)
        raw_scores = -clf.score_samples(matrix)  # higher = more anomalous
    except ImportError:  # pragma: no cover - sklearn is a hard dependency in prod
        z = (matrix - matrix.mean(axis=0)) / (matrix.std(axis=0) + 1e-9)
        raw_scores = np.abs(z).mean(axis=1)

    normalized = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9) * 100
    latest = float(normalized[-1])
    percentile_rank = float((raw_scores <= raw_scores[-1]).mean() * 100)
    return latest, {
        "percentile_vs_own_history": percentile_rank,
        "window": window,
    }
