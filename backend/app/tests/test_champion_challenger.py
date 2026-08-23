"""Champion/Challenger: label building, comparison, and the human gate."""
import pickle
from datetime import datetime, timedelta

import numpy as np
import pytest

from app.db.models.model_version import ModelVersion
from app.db.models.prediction import Outcome, Prediction
from app.services.ml.champion_challenger import (
    MIN_TRAINING_ROWS,
    NotEnoughHistory,
    PromotionRefused,
    build_labeled_dataset,
    promote_model,
    train_challenger,
)
from app.services.ml.ensemble import EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES


def _seed_history(db, n=100, seed=7):
    """Synthetic graded history where high catalyst+technical features
    correlate with runups — enough signal for training to converge.

    One row per day (not per hour): every row's holding_period_days=10
    below feeds train_challenger's purge step (services/ml/validation.py),
    which drops any training row whose 10-day label-resolution window
    reaches into the holdout's time range. Rows need real day-scale
    spread for a realistic number of training rows to survive that —
    100 rows one day apart, 75/25 split, leaves ~65 rows before the
    label horizon's exclusion zone, comfortably above MIN_TRAINING_ROWS.
    """
    rng = np.random.default_rng(seed)
    base_time = datetime(2026, 1, 1)
    for i in range(n):
        signal = rng.uniform(0, 1)
        features = {name: float(rng.normal(50, 10)) for name in FEATURE_NAMES}
        features["catalyst_score"] = 30 + signal * 60
        features["rsi_14"] = 40 + signal * 25
        features["manipulation_risk"] = float((1 - signal) * 60)
        runup = signal * 25 + rng.normal(0, 4)  # signal-linked label

        prediction = Prediction(
            ticker_symbol=f"T{i % 7}", created_at=base_time + timedelta(days=i),
            current_price=1.0, liquidity_score=50, manipulation_risk=features["manipulation_risk"],
            fundamental_score=50, technical_score=50, sentiment_score=50, catalyst_score=features["catalyst_score"],
            overall_ai_score=50, confidence_score=60,
            prob_up_5=0.4, prob_up_10=0.3, prob_up_20=0.15, prob_downside_before_upside=0.4,
            entry_zone_low=0.98, entry_zone_high=1.02, ideal_entry_price=1.0,
            stop_loss=0.9, take_profit_1=1.1, take_profit_2=1.2, take_profit_3=1.35,
            max_allocation_pct=2.0, risk_reward=2.0, holding_period_days=10,
            explanation="seed", horizon_probabilities={}, feature_snapshot=features, shap_top_factors={},
        )
        db.add(prediction)
        db.flush()
        db.add(Outcome(
            prediction_id=prediction.id, horizon_days=10,
            realized_return_pct=runup * 0.6, max_runup_pct=max(runup, 0.0),
            max_drawdown_pct=-abs(rng.normal(3, 2)),
        ))
    db.commit()


def test_not_enough_history_is_a_named_condition(db_session):
    with pytest.raises(NotEnoughHistory, match=str(MIN_TRAINING_ROWS)):
        build_labeled_dataset(db_session)


def test_labels_derive_from_max_runup(db_session):
    _seed_history(db_session)
    dataset = build_labeled_dataset(db_session)
    assert dataset.X.shape[1] == len(FEATURE_NAMES)
    assert set(dataset.labels) == {5, 10, 20}
    # +5% must be at least as common as +20% by construction.
    assert dataset.labels[5].mean() >= dataset.labels[20].mean()


def test_challenger_registered_inactive_with_comparison(db_session, tmp_path):
    _seed_history(db_session)
    version = train_challenger(db_session, artifact_dir=str(tmp_path))
    assert version.is_active is False, "a challenger must NEVER be born active"
    assert "challenger" in version.training_metrics
    assert "champion" in version.training_metrics
    assert version.training_metrics["holdout_rows"] > 0
    assert (tmp_path / f"challenger_{version.version}.pkl").exists()
    # The heuristic + baseline comparison this phase adds must always be
    # present — this is what promote_model() gates on.
    assert "heuristic" in version.training_metrics
    assert set(version.training_metrics["baselines"]) == {"logistic_regression", "momentum", "always_take_the_trade"}
    assert set(version.training_metrics["beats_on_primary_threshold"]) == {
        "heuristic", "logistic_regression", "momentum", "always_take_the_trade",
    }


def test_promotion_refused_when_challenger_does_not_beat_heuristic_or_baselines(db_session, tmp_path):
    # _seed_history's 60-row synthetic fixture is deliberately too small/
    # noisy for the LightGBM/XGBoost/CatBoost trio to reliably beat simple
    # baselines that already fit this near-linear signal well — exactly the
    # honest, expected outcome the gate exists to catch, not a test bug.
    _seed_history(db_session)
    version = train_challenger(db_session, artifact_dir=str(tmp_path))
    assert version.training_metrics["eligible_for_promotion"] is False

    with pytest.raises(PromotionRefused, match="does not beat"):
        promote_model(db_session, version.id, artifact_dir=str(tmp_path))

    # A refused promotion must never flip is_active or touch the registry.
    db_session.refresh(version)
    assert version.is_active is False
    assert db_session.query(ModelVersion).filter_by(is_active=True).count() == 0


def _passing_version(db_session, tmp_path) -> ModelVersion:
    """A hand-crafted ModelVersion whose stored comparison unambiguously
    beats every baseline, decoupled from real training's inherent
    randomness — isolates promotion *mechanics* from whether a real
    LightGBM/XGBoost/CatBoost ensemble happens to outperform on any given
    training run."""
    artifact_path = tmp_path / "challenger_test.pkl"
    with open(artifact_path, "wb") as f:
        pickle.dump(EnsembleModel(), f)

    strong = {"+5%": {"auc": 0.95}, "+10%": {"auc": 0.95}, "+20%": {"auc": 0.95}}
    weak = {"+5%": {"auc": 0.5}, "+10%": {"auc": 0.5}, "+20%": {"auc": 0.5}}
    version = ModelVersion(
        name="ensemble", version="test", model_type="ensemble",
        artifact_path=str(artifact_path),
        training_metrics={
            "challenger": strong,
            "champion": weak,
            "heuristic": weak,
            "baselines": {"logistic_regression": weak, "momentum": weak, "always_take_the_trade": weak},
            "beats_on_primary_threshold": {"heuristic": True, "logistic_regression": True, "momentum": True, "always_take_the_trade": True},
            "eligible_for_promotion": True,
        },
        hyperparameters={},
        is_active=False,
    )
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)
    return version


def test_promotion_is_explicit_and_atomic(db_session, tmp_path):
    version = _passing_version(db_session, tmp_path)
    promoted = promote_model(db_session, version.id, artifact_dir=str(tmp_path))
    assert promoted.is_active is True
    assert (tmp_path / "ensemble_latest.pkl").exists()
    actives = db_session.query(ModelVersion).filter_by(is_active=True).count()
    assert actives == 1  # exactly one champion, ever


def test_promotion_refused_for_a_version_with_no_recorded_comparison(db_session, tmp_path):
    # Simulates a ModelVersion trained by an older train_challenger() that
    # never recorded a heuristic/baseline comparison — must refuse, not
    # silently treat "no data" as "passed."
    artifact_path = tmp_path / "challenger_legacy.pkl"
    with open(artifact_path, "wb") as f:
        pickle.dump(EnsembleModel(), f)
    version = ModelVersion(
        name="ensemble", version="legacy", model_type="ensemble",
        artifact_path=str(artifact_path), training_metrics={"challenger": {}, "champion": {}},
        hyperparameters={}, is_active=False,
    )
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)

    with pytest.raises(PromotionRefused, match="no recorded"):
        promote_model(db_session, version.id, artifact_dir=str(tmp_path))


def test_promote_unknown_version_fails(db_session):
    with pytest.raises(ValueError):
        promote_model(db_session, 999_999)
