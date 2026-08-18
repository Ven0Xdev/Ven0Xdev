"""services/ml/validation.py — purged walk-forward CV, single-split
purge+embargo, and regime-conditioned metrics. Every case here targets a
concrete leakage failure mode plain random/single splits miss."""
import numpy as np
import pandas as pd
import pytest

from app.services.features.regime import HIGH_VOLATILITY_PCT, TRENDING_ADX
from app.services.ml.validation import (
    MIN_REGIME_SAMPLE,
    purge_and_embargo_single_split,
    purged_walk_forward_splits,
    regime_breakdown_metrics,
    snapshot_regime_proxy,
)


def _daily_timestamps(n, start="2026-01-01"):
    return pd.date_range(start, periods=n, freq="D")


# ---------- purged_walk_forward_splits ------------------------------------


def test_rejects_fewer_than_two_splits():
    with pytest.raises(ValueError):
        purged_walk_forward_splits(_daily_timestamps(20), n_splits=1)


def test_rejects_too_few_samples_for_the_requested_split_count():
    with pytest.raises(ValueError):
        purged_walk_forward_splits(_daily_timestamps(5), n_splits=5)


def test_returns_n_splits_minus_one_folds():
    folds = purged_walk_forward_splits(_daily_timestamps(100), n_splits=5)
    assert len(folds) == 4
    assert [f.fold_index for f in folds] == [1, 2, 3, 4]


def test_every_fold_trains_strictly_before_it_tests():
    ts = _daily_timestamps(100)
    folds = purged_walk_forward_splits(ts, n_splits=5)
    for fold in folds:
        max_train_ts = ts[fold.train_idx].max()
        min_test_ts = ts[fold.test_idx].min()
        assert max_train_ts < min_test_ts


def test_purging_drops_training_rows_whose_label_window_reaches_the_test_fold():
    ts = _daily_timestamps(100)
    no_purge = purged_walk_forward_splits(ts, n_splits=5, label_horizon_days=0, embargo_days=0)
    with_purge = purged_walk_forward_splits(ts, n_splits=5, label_horizon_days=15, embargo_days=0)
    for a, b in zip(no_purge, with_purge):
        assert len(b.train_idx) < len(a.train_idx)
        assert set(b.train_idx).issubset(set(a.train_idx))


def test_embargo_drops_additional_rows_immediately_before_the_test_fold():
    ts = _daily_timestamps(100)
    no_embargo = purged_walk_forward_splits(ts, n_splits=5, label_horizon_days=0, embargo_days=0)
    with_embargo = purged_walk_forward_splits(ts, n_splits=5, label_horizon_days=0, embargo_days=10)
    for a, b in zip(no_embargo, with_embargo):
        assert len(b.train_idx) < len(a.train_idx)
        assert set(b.train_idx).issubset(set(a.train_idx))


def test_handles_shuffled_input_order_correctly():
    ts = _daily_timestamps(60)
    rng = np.random.default_rng(3)
    shuffle = rng.permutation(60)
    shuffled_ts = ts.to_numpy()[shuffle]

    folds = purged_walk_forward_splits(shuffled_ts, n_splits=3)
    for fold in folds:
        train_ts = shuffled_ts[fold.train_idx]
        test_ts = shuffled_ts[fold.test_idx]
        assert train_ts.max() < test_ts.min()


def test_test_folds_are_non_overlapping():
    ts = _daily_timestamps(100)
    folds = purged_walk_forward_splits(ts, n_splits=5)
    seen: set[int] = set()
    for fold in folds:
        test_set = set(fold.test_idx.tolist())
        assert not (test_set & seen)
        seen |= test_set


# ---------- purge_and_embargo_single_split ---------------------------------


def test_single_split_train_precedes_holdout_in_time():
    ts = _daily_timestamps(100)
    horizons = np.full(100, 5.0)
    train_idx, holdout_idx = purge_and_embargo_single_split(ts, horizons, holdout_fraction=0.25)
    assert ts.to_numpy()[train_idx].max() < ts.to_numpy()[holdout_idx].min()


def test_single_split_rejects_out_of_bounds_holdout_fraction():
    ts = _daily_timestamps(20)
    horizons = np.full(20, 5.0)
    with pytest.raises(ValueError):
        purge_and_embargo_single_split(ts, horizons, holdout_fraction=0.0)
    with pytest.raises(ValueError):
        purge_and_embargo_single_split(ts, horizons, holdout_fraction=1.0)


def test_single_split_purges_by_each_rows_own_label_horizon():
    ts = _daily_timestamps(100)
    # A long horizon near the boundary should be purged; a short one
    # should survive — this only makes sense with *per-row* horizons.
    horizons = np.full(100, 1.0)
    holdout_start_approx = 75
    horizons[holdout_start_approx - 2] = 30.0  # long horizon, close to boundary
    horizons[holdout_start_approx - 20] = 1.0  # short horizon, further away

    train_idx, holdout_idx = purge_and_embargo_single_split(ts, horizons, holdout_fraction=0.25)
    assert (holdout_start_approx - 2) not in train_idx
    assert (holdout_start_approx - 20) in train_idx


def test_single_split_embargo_trims_a_buffer_before_the_holdout():
    ts = _daily_timestamps(100)
    horizons = np.zeros(100)
    train_no_embargo, _ = purge_and_embargo_single_split(ts, horizons, holdout_fraction=0.25, embargo_days=0)
    train_with_embargo, _ = purge_and_embargo_single_split(ts, horizons, holdout_fraction=0.25, embargo_days=10)
    assert len(train_with_embargo) < len(train_no_embargo)
    assert set(train_with_embargo).issubset(set(train_no_embargo))


# ---------- snapshot_regime_proxy -------------------------------------------


def test_high_volatility_wins_regardless_of_trend():
    assert snapshot_regime_proxy(adx=40, historical_volatility_pct=HIGH_VOLATILITY_PCT + 1, price_vs_sma20_pct=5) == "high_volatility"


def test_trending_up_requires_adx_and_positive_price_vs_sma20():
    assert snapshot_regime_proxy(adx=TRENDING_ADX + 1, historical_volatility_pct=10, price_vs_sma20_pct=2) == "trending_up"


def test_trending_down_requires_adx_and_negative_price_vs_sma20():
    assert snapshot_regime_proxy(adx=TRENDING_ADX + 1, historical_volatility_pct=10, price_vs_sma20_pct=-2) == "trending_down"


def test_ranging_when_adx_below_the_trending_threshold():
    assert snapshot_regime_proxy(adx=TRENDING_ADX - 1, historical_volatility_pct=10, price_vs_sma20_pct=5) == "ranging"


# ---------- regime_breakdown_metrics ----------------------------------------


def test_computes_auc_per_regime_separately():
    rng = np.random.default_rng(1)
    n = 60
    regimes = np.array(["trending_up"] * 30 + ["ranging"] * 30)
    # trending_up: predictions correlate with outcome; ranging: pure noise.
    y_true = np.concatenate([rng.integers(0, 2, 30), rng.integers(0, 2, 30)])
    y_pred = np.concatenate([np.where(y_true[:30] == 1, 0.8, 0.2), rng.uniform(0, 1, 30)])

    result = regime_breakdown_metrics(y_true, y_pred, regimes)
    assert set(result) == {"trending_up", "ranging"}
    assert result["trending_up"]["auc"] > 0.9
    assert "n" in result["ranging"]


def test_regimes_under_the_minimum_sample_get_an_honest_note_not_a_fabricated_metric():
    y_true = np.array([1, 0, 1])
    y_pred = np.array([0.6, 0.3, 0.7])
    regimes = np.array(["high_volatility"] * 3)
    assert MIN_REGIME_SAMPLE > 3

    result = regime_breakdown_metrics(y_true, y_pred, regimes)
    assert "note" in result["high_volatility"]
    assert "auc" not in result["high_volatility"]


def test_single_class_regime_gets_an_honest_note():
    n = MIN_REGIME_SAMPLE + 5
    y_true = np.zeros(n)  # only one class
    y_pred = np.linspace(0.1, 0.9, n)
    regimes = np.array(["ranging"] * n)

    result = regime_breakdown_metrics(y_true, y_pred, regimes)
    assert "note" in result["ranging"]
    assert "auc" not in result["ranging"]
