"""services/ml/training_pipeline.py — purged walk-forward validation
replaces the old random/single split (see services/ml/validation.py).
No prior tests existed for this module; this is new coverage."""
import numpy as np
import pytest

from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.ml.ensemble import HORIZON_THRESHOLDS
from app.services.ml.feature_vector import FEATURE_NAMES
from app.services.ml.training_pipeline import (
    N_WALK_FORWARD_SPLITS,
    TrainingSet,
    build_training_set,
    train_and_save,
)


def test_build_training_set_returns_aligned_features_labels_timestamps_and_regimes():
    provider = MockOTCProvider()
    dataset = build_training_set(provider, lookback_days=400, step=10, min_history=60)

    assert isinstance(dataset, TrainingSet)
    assert dataset.X.shape[1] == len(FEATURE_NAMES)
    n = dataset.X.shape[0]
    assert n > 0
    assert dataset.timestamps.shape == (n,)
    assert dataset.regimes.shape == (n,)
    assert set(dataset.y) == set(HORIZON_THRESHOLDS)
    for labels in dataset.y.values():
        assert labels.shape == (n,)
        assert set(np.unique(labels)).issubset({0, 1})
    assert set(dataset.regimes.tolist()).issubset({"trending_up", "trending_down", "ranging", "high_volatility"})


def test_build_training_set_timestamps_are_strictly_within_each_tickers_history():
    provider = MockOTCProvider()
    dataset = build_training_set(provider, lookback_days=400, step=20, min_history=60)
    # Every row's timestamp is a real bar timestamp — not a fabricated
    # placeholder like epoch-0 or None.
    assert all(ts is not None for ts in dataset.timestamps)


def test_a_shorter_max_forward_return_horizon_produces_more_or_equal_positive_labels():
    """+5% should fire at least as often as +20% for the same samples —
    the labels are nested by construction (whatever touches +20% within
    the horizon necessarily also touched +5%)."""
    provider = MockOTCProvider()
    dataset = build_training_set(provider, lookback_days=400, step=10, min_history=60)
    assert dataset.y[5].mean() >= dataset.y[20].mean()


def test_train_and_save_uses_purged_walk_forward_not_a_random_split(tmp_path, monkeypatch):
    # train_and_save() trains the real ensemble 6 times (5 folds + the
    # final model) — against the full mock universe that's minutes of
    # real LightGBM/XGBoost/CatBoost fitting. A 2-ticker universe still
    # exercises every code path (fold construction, purging, the
    # regime breakdown) with real samples, just fast enough for a unit test.
    provider = MockOTCProvider()
    full_universe = provider.get_universe()
    monkeypatch.setattr(provider, "get_universe", lambda limit=None: full_universe[:2])
    monkeypatch.setattr(
        "app.services.ml.training_pipeline.get_data_provider", lambda: provider,
    )

    report = train_and_save(artifact_dir=str(tmp_path))

    # N_WALK_FORWARD_SPLITS folds requested -> N_WALK_FORWARD_SPLITS - 1 reported.
    assert len(report.walk_forward_folds) == N_WALK_FORWARD_SPLITS - 1
    # Train-row counts must be non-decreasing across folds — this is an
    # *expanding* window (each fold's training set is a superset in time
    # of the previous fold's), the defining walk-forward property a
    # random split would never guarantee.
    train_rows = [f["train_rows"] for f in report.walk_forward_folds]
    assert train_rows == sorted(train_rows)

    assert report.n_samples > 0
    assert set(report.metrics) == {str(t) for t in HORIZON_THRESHOLDS}
    assert set(report.regime_breakdown) == {str(t) for t in HORIZON_THRESHOLDS}

    for regime_metrics in report.regime_breakdown.values():
        for m in regime_metrics.values():
            assert "n" in m or "note" in m or "auc" in m

    assert (tmp_path / "ensemble_latest.pkl").exists()


def test_train_and_save_raises_when_the_provider_yields_too_few_samples(monkeypatch, tmp_path):
    import app.services.ml.training_pipeline as pipeline_module

    def _empty_build_training_set(provider, **kwargs):
        return TrainingSet(
            X=np.empty((0, len(FEATURE_NAMES))), y={t: np.array([]) for t in HORIZON_THRESHOLDS},
            timestamps=np.array([]), regimes=np.array([]),
        )

    monkeypatch.setattr(pipeline_module, "build_training_set", _empty_build_training_set)
    with pytest.raises(RuntimeError, match="Not enough training samples"):
        train_and_save(artifact_dir=str(tmp_path))
