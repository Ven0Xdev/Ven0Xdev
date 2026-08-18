"""End-to-end training pipeline: pulls historical OHLCV for the OTC universe,
builds point-in-time feature vectors + forward-return labels, trains the
ensemble, and persists a versioned artifact.

Run via: `python -m app.services.ml.training_pipeline`
"""
from __future__ import annotations

import pickle
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider
from app.services.features import technical
from app.services.ml.ensemble import HORIZON_THRESHOLDS, EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES
from app.services.ml.validation import purged_walk_forward_splits, regime_breakdown_metrics

# Walk-forward folds for the validation curve reported below (see
# purged_walk_forward_splits) — the *last* fold (largest training set,
# most recent test period) is what the saved production artifact is
# actually fit on and scored against, matching this pipeline's prior
# single-holdout shape while every fold's metrics are still reported for
# transparency into how stable performance is across time.
N_WALK_FORWARD_SPLITS = 5
# Same buffer as the label horizon by default — a training sample's
# label window can reach exactly to entry_ts + label_horizon_days, so an
# embargo equal to that horizon absorbs the same serial-correlation risk
# purging already targets, without arbitrarily picking a second number.
EMBARGO_DAYS = 10
LABEL_HORIZON_DAYS = 10
MIN_FOLD_TRAIN_ROWS = 10


@dataclass
class TrainingReport:
    n_samples: int
    n_tickers: int
    metrics: dict
    walk_forward_folds: list[dict]
    regime_breakdown: dict
    artifact_path: str
    trained_at: str


def _row_features(window: pd.DataFrame) -> np.ndarray | None:
    if len(window) < 25:
        return None
    close = window["close"]
    tech = technical.compute_all_technical_features(window)
    price = tech["price"]

    row = {name: 0.0 for name in FEATURE_NAMES}
    row.update(
        {
            "rsi_14": tech["rsi_14"],
            "macd_histogram": tech["macd_histogram"],
            "adx": tech["adx"],
            "atr_pct": tech["atr_pct"],
            "bb_width_pct": tech["bb_width_pct"],
            "pct_from_52w_high": tech["pct_from_52w_high"],
            "pct_from_52w_low": tech["pct_from_52w_low"],
            "relative_volume": tech["relative_volume"],
            "historical_volatility_pct": tech["historical_volatility_pct"],
            "gap_pct": tech["gap_pct"],
            "spread_pct": tech["spread_pct"],
            "liquidity_score": 50.0,
            "fundamental_score": 50.0,
            "sentiment_score": 50.0,
            "catalyst_score": 40.0,
            "manipulation_risk": 15.0,
            "dilution_12m_pct": 5.0,
            "insider_ownership_pct": 20.0,
            "institutional_ownership_pct": 5.0,
            "reverse_split_count_3y": 0.0,
            "price_vs_vwap_pct": (price / tech["vwap"] - 1) * 100 if tech["vwap"] else 0.0,
            "price_vs_sma20_pct": (price / tech["sma_20"] - 1) * 100 if tech["sma_20"] else 0.0,
            "price_vs_ema9_pct": (price / tech["ema_9"] - 1) * 100 if tech["ema_9"] else 0.0,
        }
    )
    return np.array([row[name] for name in FEATURE_NAMES])


@dataclass
class TrainingSet:
    X: np.ndarray
    y: dict[int, np.ndarray]
    # Entry-bar timestamp per row — the purged walk-forward split's
    # ordering key (services/ml/validation.py). Never used as a feature.
    timestamps: np.ndarray
    # Real detect_regime() read on each row's own window (this pipeline
    # has the actual OHLCV history, unlike champion_challenger.py's
    # frozen-feature-snapshot case, which uses the cruder
    # snapshot_regime_proxy instead) — for the regime-breakdown metrics.
    regimes: np.ndarray


def build_training_set(
    provider: MarketDataProvider,
    lookback_days: int = 400,
    step: int = 5,
    label_horizon_days: int = LABEL_HORIZON_DAYS,
    min_history: int = 60,
) -> TrainingSet:
    from app.services.features.regime import detect_regime

    X_rows: list[np.ndarray] = []
    labels: dict[int, list[int]] = {t: [] for t in HORIZON_THRESHOLDS}
    timestamps: list = []
    regimes: list[str] = []

    for meta in provider.get_universe():
        df = provider.get_ohlcv(meta.symbol, lookback_days=lookback_days)
        if len(df) < min_history + label_horizon_days:
            continue
        for end_idx in range(min_history, len(df) - label_horizon_days, step):
            window = df.iloc[: end_idx + 1]
            features = _row_features(window)
            if features is None:
                continue
            entry_price = df["close"].iloc[end_idx]
            forward_prices = df["close"].iloc[end_idx + 1 : end_idx + 1 + label_horizon_days]
            if forward_prices.empty or entry_price <= 0:
                continue
            max_forward_return = (forward_prices.max() / entry_price - 1) * 100

            X_rows.append(features)
            timestamps.append(df.index[end_idx])
            try:
                regimes.append(detect_regime(window).regime)
            except ValueError:
                regimes.append("ranging")  # window too short for a regime read — never fabricate; default is neutral
            for threshold in HORIZON_THRESHOLDS:
                labels[threshold].append(int(max_forward_return >= threshold))

    X = np.vstack(X_rows) if X_rows else np.empty((0, len(FEATURE_NAMES)))
    y = {t: np.array(v) for t, v in labels.items()}
    return TrainingSet(X=X, y=y, timestamps=np.array(timestamps), regimes=np.array(regimes))


def _score_thresholds(model: EnsembleModel, X: np.ndarray, y: dict[int, np.ndarray], idx: np.ndarray) -> dict:
    """Per-threshold AUC + positive rate for `model` on rows `idx` — the
    one scoring routine every fold (walk-forward validation curve) and
    the final held-out test set below both use, so "the metrics" always
    means the same computation regardless of which split produced them.
    """
    metrics = {}
    for threshold in HORIZON_THRESHOLDS:
        y_test = y[threshold][idx]
        if len(np.unique(y_test)) < 2:
            metrics[str(threshold)] = {"note": "insufficient class balance in this split"}
            continue
        preds = [model.predict(X[i]).probabilities[threshold] for i in idx]
        try:
            from sklearn.metrics import roc_auc_score

            auc = float(roc_auc_score(y_test, preds))
        except Exception:
            auc = None
        metrics[str(threshold)] = {"auc": auc, "positive_rate": float(y_test.mean())}
    return metrics


def train_and_save(artifact_dir: str | None = None) -> TrainingReport:
    """Purged walk-forward validation (services/ml/validation.py), not a
    random/single split: samples are entry-bar-level windows with
    overlapping forward-return label horizons (see build_training_set),
    so a plain random split would train and test on samples whose labels
    were computed from overlapping future price action — direct leakage.

    N_WALK_FORWARD_SPLITS folds are each independently trained/scored to
    report a real validation curve (is performance stable across time,
    not just one lucky split); the production artifact this actually
    saves is fit on the LAST fold's training set (the largest, most
    recent-history expanding window) and scored on that fold's held-out
    test rows — the same single-holdout shape this pipeline always had,
    now leakage-safe. A regime breakdown of that final holdout catches a
    model that's only accurate in whichever regime happens to dominate
    the sample.
    """
    settings = get_settings()
    provider = get_data_provider()
    dataset = build_training_set(provider)
    X, y, timestamps, regimes = dataset.X, dataset.y, dataset.timestamps, dataset.regimes

    if len(X) < 30:
        raise RuntimeError("Not enough training samples generated from the data provider")

    n = len(X)
    folds = purged_walk_forward_splits(
        timestamps, n_splits=N_WALK_FORWARD_SPLITS, label_horizon_days=LABEL_HORIZON_DAYS, embargo_days=EMBARGO_DAYS,
    )

    walk_forward_report = []
    for fold in folds:
        if len(fold.train_idx) < MIN_FOLD_TRAIN_ROWS:
            # Purging/embargo can legitimately empty out an early fold's
            # small training set — report that honestly instead of
            # attempting to fit a GBM trio on too few rows.
            walk_forward_report.append({
                "fold": fold.fold_index, "train_rows": int(len(fold.train_idx)), "test_rows": int(len(fold.test_idx)),
                "metrics": {"note": f"fewer than {MIN_FOLD_TRAIN_ROWS} training rows survived purging/embargo for this fold"},
            })
            continue
        fold_model = EnsembleModel(random_state=settings.random_seed)
        fold_model.fit(X[fold.train_idx], {t: v[fold.train_idx] for t, v in y.items()}, FEATURE_NAMES)
        walk_forward_report.append({
            "fold": fold.fold_index,
            "train_rows": int(len(fold.train_idx)),
            "test_rows": int(len(fold.test_idx)),
            "metrics": _score_thresholds(fold_model, X, y, fold.test_idx),
        })

    final_fold = folds[-1]
    train_idx, test_idx = final_fold.train_idx, final_fold.test_idx
    if len(train_idx) < MIN_FOLD_TRAIN_ROWS:
        raise RuntimeError(
            f"The final walk-forward fold has only {len(train_idx)} training rows after purging/embargo "
            f"(need >= {MIN_FOLD_TRAIN_ROWS}) — not enough chronological spread in this data to train safely."
        )

    model = EnsembleModel(random_state=settings.random_seed)
    model.fit(X[train_idx], {t: v[train_idx] for t, v in y.items()}, FEATURE_NAMES)
    metrics = _score_thresholds(model, X, y, test_idx)

    regime_report = {}
    for threshold in HORIZON_THRESHOLDS:
        y_test = y[threshold][test_idx]
        preds = np.array([model.predict(X[i]).probabilities[threshold] for i in test_idx])
        regime_report[str(threshold)] = regime_breakdown_metrics(y_test, preds, regimes[test_idx])

    out_dir = Path(artifact_dir or settings.model_artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    model.version = version
    artifact_path = out_dir / f"ensemble_{version}.pkl"
    with open(artifact_path, "wb") as f:
        pickle.dump(model, f)

    latest_path = out_dir / "ensemble_latest.pkl"
    with open(latest_path, "wb") as f:
        pickle.dump(model, f)

    return TrainingReport(
        n_samples=n,
        n_tickers=len(provider.get_universe()),
        metrics=metrics,
        walk_forward_folds=walk_forward_report,
        regime_breakdown=regime_report,
        artifact_path=str(artifact_path),
        trained_at=datetime.now(timezone.utc).isoformat(),
    )


def load_latest_model(artifact_dir: str | None = None) -> EnsembleModel | None:
    settings = get_settings()
    path = Path(artifact_dir or settings.model_artifact_dir) / "ensemble_latest.pkl"
    if not path.exists():
        return None
    with open(path, "rb") as f:
        return pickle.load(f)


if __name__ == "__main__":
    report = train_and_save()
    print(report)
