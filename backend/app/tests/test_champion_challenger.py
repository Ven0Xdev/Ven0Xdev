"""Champion/Challenger: label building, comparison, and the human gate."""
from datetime import datetime, timedelta

import numpy as np
import pytest

from app.db.models.model_version import ModelVersion
from app.db.models.prediction import Outcome, Prediction
from app.services.ml.champion_challenger import (
    MIN_TRAINING_ROWS,
    NotEnoughHistory,
    build_labeled_dataset,
    promote_model,
    train_challenger,
)
from app.services.ml.feature_vector import FEATURE_NAMES


def _seed_history(db, n=60, seed=7):
    """Synthetic graded history where high catalyst+technical features
    correlate with runups — enough signal for training to converge."""
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
            ticker_symbol=f"T{i % 7}", created_at=base_time + timedelta(hours=i),
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


def test_promotion_is_explicit_and_atomic(db_session, tmp_path):
    _seed_history(db_session)
    version = train_challenger(db_session, artifact_dir=str(tmp_path))
    promoted = promote_model(db_session, version.id, artifact_dir=str(tmp_path))
    assert promoted.is_active is True
    assert (tmp_path / "ensemble_latest.pkl").exists()
    actives = db_session.query(ModelVersion).filter_by(is_active=True).count()
    assert actives == 1  # exactly one champion, ever


def test_promote_unknown_version_fails(db_session):
    with pytest.raises(ValueError):
        promote_model(db_session, 999_999)
