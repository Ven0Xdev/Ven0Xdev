"""Walk-forward model validation with calibration reporting.

The question this answers is the one that matters: *would the ensemble have
been honest if trained only on the past and judged only on the future?*
Each fold trains strictly on bars before the fold boundary and evaluates on
the bars after it — the temporal ordering of reality, no shuffling, no
lookahead. Reported per fold and in aggregate:

- AUC per threshold (discrimination: does the model rank winners above losers?)
- Calibration buckets (honesty: do predicted probabilities match realized
  frequencies out-of-sample?)

This complements the trade-level backtest engine (`engine.py`, which owns
spread/slippage/fees/partial fills/halts/delisting mechanics) — that one
validates *execution*, this one validates *the probabilities themselves*.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.services.data_providers.base import MarketDataProvider
from app.services.ml.ensemble import HORIZON_THRESHOLDS, EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES
from app.services.ml.training_pipeline import _row_features

LABEL_HORIZON_DAYS = 10
MIN_HISTORY = 60


@dataclass
class FoldReport:
    fold: int
    train_rows: int
    test_rows: int
    metrics: dict = field(default_factory=dict)


def _dataset_between(provider: MarketDataProvider, symbols: list[str], lookback_days: int,
                     start_frac: float, end_frac: float, step: int = 5):
    """Point-in-time rows whose decision bar falls inside [start, end) of
    each symbol's history. Labels look LABEL_HORIZON_DAYS forward, so a
    row near the boundary never peeks past it plus the label horizon —
    the test fold starts after train labels fully resolve.
    """
    X_rows, labels = [], {t: [] for t in HORIZON_THRESHOLDS}
    for symbol in symbols:
        df = provider.get_ohlcv(symbol, lookback_days=lookback_days)
        n = len(df)
        lo = max(int(n * start_frac), MIN_HISTORY)
        hi = min(int(n * end_frac), n - LABEL_HORIZON_DAYS)
        for end_idx in range(lo, hi, step):
            features = _row_features(df.iloc[: end_idx + 1])
            if features is None:
                continue
            entry = df["close"].iloc[end_idx]
            forward = df["high"].iloc[end_idx + 1 : end_idx + 1 + LABEL_HORIZON_DAYS]
            if forward.empty or entry <= 0:
                continue
            max_runup = (forward.max() / entry - 1) * 100
            X_rows.append(features)
            for threshold in HORIZON_THRESHOLDS:
                labels[threshold].append(int(max_runup >= threshold))
    X = np.vstack(X_rows) if X_rows else np.empty((0, len(FEATURE_NAMES)))
    return X, {t: np.array(v) for t, v in labels.items()}


def _calibration_buckets(y: np.ndarray, preds: np.ndarray, n_buckets: int = 4) -> list[dict]:
    buckets = []
    edges = np.linspace(0, 1, n_buckets + 1)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (preds >= lo) & (preds < hi if hi < 1 else preds <= hi)
        if mask.sum() == 0:
            buckets.append({"range": [round(float(lo), 2), round(float(hi), 2)], "count": 0})
            continue
        buckets.append(
            {
                "range": [round(float(lo), 2), round(float(hi), 2)],
                "count": int(mask.sum()),
                "avg_predicted": round(float(preds[mask].mean()), 3),
                "realized_frequency": round(float(y[mask].mean()), 3),
                "gap": round(float(y[mask].mean() - preds[mask].mean()), 3),
            }
        )
    return buckets


def run_walk_forward_validation(
    provider: MarketDataProvider,
    symbols: list[str],
    n_folds: int = 3,
    lookback_days: int = 300,
    random_state: int = 42,
) -> dict:
    from sklearn.metrics import roc_auc_score

    folds: list[FoldReport] = []
    all_preds: dict[int, list] = {t: [] for t in HORIZON_THRESHOLDS}
    all_labels: dict[int, list] = {t: [] for t in HORIZON_THRESHOLDS}

    # Fold k: train on [0, b_k), test on [b_k, b_{k+1}) — expanding window.
    boundaries = np.linspace(0.4, 1.0, n_folds + 1)
    for k in range(n_folds):
        X_train, y_train = _dataset_between(provider, symbols, lookback_days, 0.0, boundaries[k])
        X_test, y_test = _dataset_between(provider, symbols, lookback_days, boundaries[k], boundaries[k + 1])
        if len(X_train) < 30 or len(X_test) < 10:
            folds.append(FoldReport(fold=k + 1, train_rows=len(X_train), test_rows=len(X_test),
                                    metrics={"note": "insufficient rows in fold"}))
            continue

        model = EnsembleModel(random_state=random_state)
        model.fit(X_train, y_train, FEATURE_NAMES)

        fold_metrics: dict = {}
        for threshold in HORIZON_THRESHOLDS:
            preds = np.array([model.predict(X_test[i]).probabilities[threshold] for i in range(len(X_test))])
            y = y_test[threshold]
            all_preds[threshold].extend(preds.tolist())
            all_labels[threshold].extend(y.tolist())
            entry: dict = {"positive_rate": round(float(y.mean()), 3)}
            if len(np.unique(y)) == 2:
                entry["auc"] = round(float(roc_auc_score(y, preds)), 4)
            fold_metrics[f"+{threshold}%"] = entry
        folds.append(FoldReport(fold=k + 1, train_rows=len(X_train), test_rows=len(X_test), metrics=fold_metrics))

    aggregate: dict = {}
    for threshold in HORIZON_THRESHOLDS:
        y = np.array(all_labels[threshold])
        preds = np.array(all_preds[threshold])
        if len(y) == 0:
            continue
        entry: dict = {
            "test_rows": len(y),
            "positive_rate": round(float(y.mean()), 3),
            "calibration": _calibration_buckets(y, preds),
        }
        if len(np.unique(y)) == 2:
            from sklearn.metrics import roc_auc_score as _auc

            entry["auc"] = round(float(_auc(y, preds)), 4)
        aggregate[f"+{threshold}%"] = entry

    return {
        "symbols": symbols,
        "n_folds": n_folds,
        "label_horizon_days": LABEL_HORIZON_DAYS,
        "folds": [{"fold": f.fold, "train_rows": f.train_rows, "test_rows": f.test_rows, "metrics": f.metrics} for f in folds],
        "aggregate_out_of_sample": aggregate,
        "note": "All folds train strictly on the past and test strictly on the future — no shuffling, no lookahead.",
    }
