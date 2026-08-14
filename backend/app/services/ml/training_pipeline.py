"""End-to-end training pipeline: pulls historical OHLCV for the OTC universe,
builds point-in-time feature vectors + forward-return labels, trains the
ensemble, and persists a versioned artifact.

Run via: `python -m app.services.ml.training_pipeline`
"""
from __future__ import annotations

import pickle
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider
from app.services.features import technical
from app.services.ml.ensemble import HORIZON_THRESHOLDS, EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES


@dataclass
class TrainingReport:
    n_samples: int
    n_tickers: int
    metrics: dict
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


def build_training_set(
    provider: MarketDataProvider,
    lookback_days: int = 400,
    step: int = 5,
    label_horizon_days: int = 10,
    min_history: int = 60,
) -> tuple[np.ndarray, dict[int, np.ndarray]]:
    X_rows: list[np.ndarray] = []
    labels: dict[int, list[int]] = {t: [] for t in HORIZON_THRESHOLDS}

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
            for threshold in HORIZON_THRESHOLDS:
                labels[threshold].append(int(max_forward_return >= threshold))

    X = np.vstack(X_rows) if X_rows else np.empty((0, len(FEATURE_NAMES)))
    y = {t: np.array(v) for t, v in labels.items()}
    return X, y


def train_and_save(artifact_dir: str | None = None) -> TrainingReport:
    settings = get_settings()
    provider = get_data_provider()
    X, y = build_training_set(provider)

    if len(X) < 30:
        raise RuntimeError("Not enough training samples generated from the data provider")

    n = len(X)
    split = int(n * 0.8)
    idx = np.random.default_rng(settings.random_seed).permutation(n)
    train_idx, test_idx = idx[:split], idx[split:]

    model = EnsembleModel(random_state=settings.random_seed)
    model.fit(X[train_idx], {t: v[train_idx] for t, v in y.items()}, FEATURE_NAMES)

    metrics = {}
    for threshold in HORIZON_THRESHOLDS:
        y_test = y[threshold][test_idx]
        if len(np.unique(y_test)) < 2:
            metrics[str(threshold)] = {"note": "insufficient class balance in holdout"}
            continue
        preds = [model.predict(X[i]).probabilities[threshold] for i in test_idx]
        try:
            from sklearn.metrics import roc_auc_score

            auc = float(roc_auc_score(y_test, preds))
        except Exception:
            auc = None
        metrics[str(threshold)] = {"auc": auc, "positive_rate": float(y_test.mean())}

    out_dir = Path(artifact_dir or settings.model_artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    version = datetime.utcnow().strftime("%Y%m%d%H%M%S")
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
        artifact_path=str(artifact_path),
        trained_at=datetime.utcnow().isoformat(),
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
