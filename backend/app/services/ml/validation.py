"""ML validation rigor: purged walk-forward cross-validation, an embargo
buffer around every train/test boundary, and regime-conditioned metric
breakdowns.

Addresses two standard time-series leakage failure modes plain
random/single-split validation misses:

- **Purging**: a training sample's label is only "resolved" some horizon
  after its own timestamp (e.g. "did price touch +10% within the next 10
  days"). If that resolution window reaches into the test period's time
  range, the training label was computed using price action the model is
  then "tested" on seeing for the first time — direct leakage. Purging
  drops any training sample whose label-resolution window overlaps the
  test period.
- **Embargo**: even after purging, engineered features carry serial
  correlation across the train/test boundary (a 14-day RSI computed one
  bar before the boundary still encodes several days that bleed into the
  embargo window). An embargo drops an additional buffer of training
  samples immediately preceding the test period's start.

Two split strategies are provided:
- `purged_walk_forward_splits` — k expanding-window folds, ordered
  strictly by time (never shuffled, never tests on data older than its
  own training set) — used by services/ml/training_pipeline.py's
  from-scratch training run.
- `purge_and_embargo_single_split` — one time-ordered train/holdout split
  with per-row label horizons (not a single fixed horizon), for a
  pipeline that already has a single fixed holdout window — used by
  services/ml/champion_challenger.py's real-history retraining loop.

`regime_breakdown_metrics` / `snapshot_regime_proxy` catch a different
failure: a model whose blended AUC looks fine can still be badly
overfit to one market regime if that regime dominates the sample. Every
comparison this platform already makes (challenger vs. champion vs.
heuristic vs. baselines) gets a per-regime breakdown alongside the
blended number, never instead of it.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.services.features.regime import HIGH_VOLATILITY_PCT, TRENDING_ADX

MIN_REGIME_SAMPLE = 10


@dataclass
class WalkForwardFold:
    fold_index: int
    train_idx: np.ndarray
    test_idx: np.ndarray


def purged_walk_forward_splits(
    timestamps: pd.Series | np.ndarray,
    n_splits: int = 5,
    label_horizon_days: float = 0.0,
    embargo_days: float = 0.0,
) -> list[WalkForwardFold]:
    """Expanding-window walk-forward folds ordered strictly by
    `timestamps` — fold k always trains on everything chronologically
    before test fold k, exactly like real deployment (never train on
    data from after what it's tested on). Samples need not be
    pre-sorted; this sorts internally and returns indices into the
    *original* (caller's) array order.

    Fold 0 is test-only (nothing chronologically before it to train on)
    and is skipped — this always returns at most `n_splits - 1` folds.
    """
    if n_splits < 2:
        raise ValueError("n_splits must be >= 2")
    ts = pd.to_datetime(pd.Series(np.asarray(timestamps)).reset_index(drop=True))
    n = len(ts)
    if n < n_splits * 2:
        raise ValueError(f"Need at least {n_splits * 2} samples for {n_splits} walk-forward folds, got {n}")

    order = np.argsort(ts.to_numpy(), kind="stable")
    ts_sorted = ts.to_numpy()[order]
    fold_positions = np.array_split(np.arange(n), n_splits)

    label_horizon = pd.Timedelta(days=label_horizon_days)
    embargo = pd.Timedelta(days=embargo_days)

    folds: list[WalkForwardFold] = []
    for k in range(1, n_splits):
        test_positions = fold_positions[k]
        train_positions = np.concatenate(fold_positions[:k])

        test_start = ts_sorted[test_positions[0]]
        train_ts = ts_sorted[train_positions]

        # Purge: drop training rows whose label window [ts, ts+horizon]
        # reaches into the test fold's time range.
        purge_keep = (train_ts + label_horizon) < test_start
        # Embargo: drop an additional buffer immediately before the test
        # fold's start.
        embargo_keep = train_ts < (test_start - embargo)

        keep = purge_keep & embargo_keep
        folds.append(WalkForwardFold(
            fold_index=k,
            train_idx=order[train_positions[keep]],
            test_idx=order[test_positions],
        ))
    return folds


def purge_and_embargo_single_split(
    timestamps: pd.Series | np.ndarray,
    label_horizons_days: pd.Series | np.ndarray,
    holdout_fraction: float = 0.25,
    embargo_days: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """One time-ordered train/holdout split (the shape
    services/ml/champion_challenger.py already uses) with per-row label
    horizons — each training row is purged individually using its *own*
    holding_period_days rather than one fixed horizon for every row,
    since predictions in this platform have genuinely different holding
    periods. Returns (train_idx, holdout_idx) into the original order.
    """
    if not 0.0 < holdout_fraction < 1.0:
        raise ValueError("holdout_fraction must be between 0 and 1")
    ts = pd.DatetimeIndex(pd.to_datetime(pd.Series(np.asarray(timestamps)).reset_index(drop=True)))
    horizons = pd.Series(np.asarray(label_horizons_days, dtype=float)).reset_index(drop=True)
    n = len(ts)

    order = np.argsort(ts.to_numpy(), kind="stable")
    ts_sorted = ts[order]
    horizons_sorted = horizons.to_numpy()[order]

    split = int(n * (1 - holdout_fraction))
    train_positions = np.arange(split)
    holdout_positions = np.arange(split, n)
    if len(holdout_positions) == 0:
        raise ValueError("holdout_fraction leaves zero holdout rows")

    holdout_start = ts_sorted[holdout_positions[0]]
    label_end = ts_sorted[train_positions] + pd.to_timedelta(horizons_sorted[train_positions], unit="D")
    purge_keep = np.asarray(label_end < holdout_start)
    embargo_keep = np.asarray(ts_sorted[train_positions] < (holdout_start - pd.Timedelta(days=embargo_days)))

    keep = purge_keep & embargo_keep
    return order[train_positions[keep]], order[holdout_positions]


def snapshot_regime_proxy(adx: float, historical_volatility_pct: float, price_vs_sma20_pct: float) -> str:
    """A market-regime label derived only from a *frozen feature
    snapshot* (adx / historical_volatility_pct / price_vs_sma20_pct —
    every field already stored on a graded Prediction, see
    champion_challenger.py's build_labeled_dataset) rather than a fresh
    OHLCV window. This is a deliberate proxy, not a re-run of
    features/regime.py's detect_regime(): it reuses that module's exact
    HIGH_VOLATILITY_PCT/TRENDING_ADX thresholds for consistency, but
    substitutes price-vs-SMA20 sign for detect_regime's true 10-bar EMA
    slope, because a frozen snapshot has no price history to compute a
    slope from. Never presented as identical to detect_regime's output —
    only as the closest honest approximation available from stored data.
    """
    if historical_volatility_pct >= HIGH_VOLATILITY_PCT:
        return "high_volatility"
    if adx >= TRENDING_ADX and price_vs_sma20_pct > 0:
        return "trending_up"
    if adx >= TRENDING_ADX and price_vs_sma20_pct < 0:
        return "trending_down"
    return "ranging"


def regime_breakdown_metrics(y_true: np.ndarray, y_pred: np.ndarray, regimes: np.ndarray) -> dict[str, dict]:
    """Per-regime AUC/calibration/Brier — catches a model that's only
    accurate in the regime that happens to dominate the sample, which a
    single blended metric hides. Regimes with too few samples or only
    one observed class report an honest note instead of a fabricated
    number (an AUC is undefined with one class, and unreliable under
    ~MIN_REGIME_SAMPLE points)."""
    from sklearn.metrics import roc_auc_score

    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    regimes = np.asarray(regimes)

    out: dict[str, dict] = {}
    for regime in sorted(set(regimes.tolist())):
        mask = regimes == regime
        y_r, p_r = y_true[mask], y_pred[mask]
        if len(y_r) < MIN_REGIME_SAMPLE:
            out[regime] = {"n": len(y_r), "note": f"only {len(y_r)} samples — too few for a reliable metric"}
            continue
        if len(np.unique(y_r)) < 2:
            out[regime] = {"n": len(y_r), "note": "single-class holdout for this regime"}
            continue
        out[regime] = {
            "n": len(y_r),
            "auc": round(float(roc_auc_score(y_r, p_r)), 4),
            "positive_rate": round(float(y_r.mean()), 4),
            "calibration_gap": round(float(abs(p_r.mean() - y_r.mean())), 4),
        }
    return out
