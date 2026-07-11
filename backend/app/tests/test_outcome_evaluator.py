from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from app.db.models.prediction import Outcome, Prediction
from app.services.evaluation.outcome_evaluator import (
    build_calibration_report,
    evaluate_due_predictions,
)
from app.services.data_providers.base import MarketDataProvider


class ScriptedProvider(MarketDataProvider):
    """Provider that returns a hand-written price path, so every grading
    rule is tested against explicit, non-fabricated fixture data.
    """

    name = "scripted"

    def __init__(self, df: pd.DataFrame):
        self.df = df

    def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250):
        return self.df

    def get_universe(self, limit=None):
        return []

    def get_ticker_meta(self, symbol):
        raise NotImplementedError

    def get_quote(self, symbol):
        raise NotImplementedError

    def get_fundamentals(self, symbol):
        raise NotImplementedError

    def get_news(self, symbol, limit=20):
        return []

    def get_corporate_actions(self, symbol):
        return []


def _path_df(closes: list[float], highs: list[float], lows: list[float], start: datetime) -> pd.DataFrame:
    dates = pd.bdate_range(start=start, periods=len(closes))
    closes_arr = np.array(closes, dtype=float)
    return pd.DataFrame(
        {
            "open": closes_arr,
            "high": np.array(highs, dtype=float),
            "low": np.array(lows, dtype=float),
            "close": closes_arr,
            "volume": np.full(len(closes), 100_000.0),
        },
        index=dates,
    )


def _prediction(created_at: datetime, **overrides) -> Prediction:
    defaults = dict(
        ticker_symbol="TEST",
        created_at=created_at,
        current_price=1.00,
        liquidity_score=50, manipulation_risk=10, fundamental_score=50,
        technical_score=50, sentiment_score=50, catalyst_score=50,
        overall_ai_score=50, confidence_score=50,
        prob_up_5=0.4, prob_up_10=0.3, prob_up_20=0.15,
        prob_downside_before_upside=0.4,
        entry_zone_low=0.98, entry_zone_high=1.02,
        ideal_entry_price=1.00,
        stop_loss=0.90,
        take_profit_1=1.10, take_profit_2=1.20, take_profit_3=1.35,
        max_allocation_pct=2.0, risk_reward=2.0, holding_period_days=5,
        explanation="test", horizon_probabilities={}, feature_snapshot={}, shap_top_factors={},
    )
    defaults.update(overrides)
    return Prediction(**defaults)


@pytest.fixture
def created_at():
    return datetime(2026, 6, 1, 12, 0, 0)


def _evaluate(db_session, provider, prediction):
    db_session.add(prediction)
    db_session.commit()
    summary = evaluate_due_predictions(db_session, provider)
    outcome = db_session.query(Outcome).filter_by(prediction_id=prediction.id).one_or_none()
    return summary, outcome


def test_tp1_hit_cleanly(db_session, created_at):
    # Price walks up through TP1 (1.10) without ever touching the stop (0.90).
    df = _path_df(
        closes=[1.02, 1.05, 1.12, 1.15, 1.13],
        highs=[1.03, 1.07, 1.14, 1.16, 1.15],
        lows=[1.00, 1.03, 1.08, 1.12, 1.11],
        start=created_at + timedelta(days=1),
    )
    _, outcome = _evaluate(db_session, ScriptedProvider(df), _prediction(created_at))
    assert outcome is not None
    assert outcome.hit_take_profit_1 is True
    assert outcome.hit_stop_loss is False
    assert outcome.realized_return_pct == pytest.approx(13.0, abs=0.01)


def test_stop_hit_before_tp(db_session, created_at):
    # Price collapses through the stop first; the later rally doesn't count.
    df = _path_df(
        closes=[0.95, 0.88, 0.92, 1.12, 1.15],
        highs=[0.97, 0.91, 0.95, 1.14, 1.16],
        lows=[0.92, 0.86, 0.90, 1.05, 1.12],
        start=created_at + timedelta(days=1),
    )
    _, outcome = _evaluate(db_session, ScriptedProvider(df), _prediction(created_at))
    assert outcome.hit_stop_loss is True
    assert outcome.hit_take_profit_1 is False
    assert outcome.hit_take_profit_2 is False


def test_same_bar_tie_goes_to_stop(db_session, created_at):
    # One giant bar spans both stop (0.90) and TP1 (1.10): conservative rule.
    df = _path_df(
        closes=[1.00, 1.00, 1.00, 1.00, 1.00],
        highs=[1.15, 1.01, 1.01, 1.01, 1.01],
        lows=[0.85, 0.99, 0.99, 0.99, 0.99],
        start=created_at + timedelta(days=1),
    )
    _, outcome = _evaluate(db_session, ScriptedProvider(df), _prediction(created_at))
    assert outcome.hit_stop_loss is True
    assert outcome.hit_take_profit_1 is False


def test_immature_prediction_is_skipped(db_session, created_at):
    # Only 3 bars exist after the prediction; horizon needs 5.
    df = _path_df(
        closes=[1.02, 1.04, 1.05],
        highs=[1.03, 1.05, 1.06],
        lows=[1.00, 1.02, 1.03],
        start=created_at + timedelta(days=1),
    )
    summary, outcome = _evaluate(db_session, ScriptedProvider(df), _prediction(created_at))
    assert outcome is None
    assert summary.skipped_immature == 1


def test_idempotent_never_double_grades(db_session, created_at):
    df = _path_df(
        closes=[1.02, 1.05, 1.12, 1.15, 1.13],
        highs=[1.03, 1.07, 1.14, 1.16, 1.15],
        lows=[1.00, 1.03, 1.08, 1.12, 1.11],
        start=created_at + timedelta(days=1),
    )
    provider = ScriptedProvider(df)
    prediction = _prediction(created_at)
    _evaluate(db_session, provider, prediction)
    second = evaluate_due_predictions(db_session, provider)
    assert second.evaluated == 0
    assert db_session.query(Outcome).filter_by(prediction_id=prediction.id).count() == 1


def test_max_drawdown_recorded(db_session, created_at):
    # Dips to 0.92 (-8%) before rallying; never touches the 0.90 stop.
    df = _path_df(
        closes=[0.96, 0.94, 1.05, 1.12, 1.14],
        highs=[0.99, 0.96, 1.08, 1.14, 1.15],
        lows=[0.94, 0.92, 1.02, 1.08, 1.11],
        start=created_at + timedelta(days=1),
    )
    _, outcome = _evaluate(db_session, ScriptedProvider(df), _prediction(created_at))
    assert outcome.hit_stop_loss is False
    assert outcome.max_drawdown_pct == pytest.approx(-8.0, abs=0.01)


def test_calibration_report_buckets(db_session, created_at):
    df = _path_df(
        closes=[1.02, 1.05, 1.12, 1.15, 1.13],
        highs=[1.03, 1.07, 1.14, 1.16, 1.15],
        lows=[1.00, 1.03, 1.08, 1.12, 1.11],
        start=created_at + timedelta(days=1),
    )
    _evaluate(db_session, ScriptedProvider(df), _prediction(created_at, prob_up_10=0.35))
    report = build_calibration_report(db_session)
    assert report["total_scored"] == 1
    populated = [b for b in report["buckets"] if b["count"] > 0]
    assert len(populated) == 1
    assert populated[0]["realized_frequency"] == 1.0
