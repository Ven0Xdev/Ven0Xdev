"""Closes the prediction -> realized-outcome learning loop.

Every logged `Prediction` is an immutable claim about the future ("~34%
probability of touching +10% within 10 trading days, stop at X, targets at
Y/Z/W"). This module is the referee: once a prediction's horizon has fully
elapsed, it replays the actual price history over that window and records
what really happened as an `Outcome` row.

Design decisions:

- **Barrier semantics match how the probabilities are defined.** The scorer
  estimates *touch* probabilities (does price trade at/through the level at
  any point in the window), so evaluation checks bar highs/lows against the
  levels — not just the closing price at horizon end.
- **Conservative same-bar rule, identical to the backtest engine.** If a
  single bar spans both the stop and a take-profit, the stop is assumed to
  have been hit first. Daily OHLC cannot reveal intrabar sequencing, and a
  research platform must not grade itself generously on ambiguity.
- **Trading-bar horizons, not calendar days.** A 10-day horizon means 10
  bars actually traded after the prediction, so weekends/halts don't
  silently shrink the evaluation window.
- **Idempotent.** A prediction is evaluated exactly once; re-runs skip
  anything that already has an Outcome. Partially-matured predictions are
  left alone until enough bars exist.

The output feeds two consumers: the calibration report (predicted
probability vs. realized frequency, the honest measure of whether our
probabilities mean anything) and, once enough history accumulates,
re-fitting `services/ml/calibration.py` on real outcomes instead of
training-set outcomes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.prediction import Outcome, Prediction
from app.services.data_providers.base import MarketDataProvider

logger = logging.getLogger(__name__)


@dataclass
class EvaluationSummary:
    evaluated: int
    skipped_immature: int
    skipped_no_data: int


def evaluate_due_predictions(
    db: Session,
    provider: MarketDataProvider,
    max_batch: int = 500,
) -> EvaluationSummary:
    """Evaluate every prediction whose horizon has fully elapsed and which
    has no Outcome yet. Safe to call repeatedly (e.g. once per scan cycle).
    """
    evaluated_ids = {o.prediction_id for o in db.query(Outcome.prediction_id).all()}
    candidates = (
        db.query(Prediction)
        .order_by(Prediction.created_at.asc())
        .limit(max_batch * 3)
        .all()
    )

    summary = EvaluationSummary(evaluated=0, skipped_immature=0, skipped_no_data=0)

    for prediction in candidates:
        if prediction.id in evaluated_ids or summary.evaluated >= max_batch:
            continue

        try:
            df = provider.get_ohlcv(prediction.ticker_symbol, lookback_days=400)
        except Exception:
            logger.exception("No price history for %s", prediction.ticker_symbol)
            summary.skipped_no_data += 1
            continue

        window = _bars_after(df, prediction.created_at, prediction.holding_period_days)
        if window is None:
            summary.skipped_immature += 1
            continue

        outcome = _grade(prediction, window)
        db.add(outcome)
        summary.evaluated += 1

    db.commit()
    return summary


def _bars_after(df: pd.DataFrame, created_at: datetime, horizon_bars: int) -> pd.DataFrame | None:
    """The first `horizon_bars` bars strictly after the prediction time,
    or None if the horizon hasn't fully matured yet.
    """
    created_ts = pd.Timestamp(created_at)
    if created_ts.tzinfo is None and df.index.tz is not None:
        created_ts = created_ts.tz_localize(df.index.tz)
    elif created_ts.tzinfo is not None and df.index.tz is None:
        created_ts = created_ts.tz_localize(None)

    after = df[df.index > created_ts]
    if len(after) < horizon_bars:
        return None
    return after.iloc[:horizon_bars]


def _grade(prediction: Prediction, window: pd.DataFrame) -> Outcome:
    entry = prediction.ideal_entry_price or window["close"].iloc[0]
    highs = window["high"]
    lows = window["low"]

    stop_hits = lows <= prediction.stop_loss
    tp1_hits = highs >= prediction.take_profit_1
    tp2_hits = highs >= prediction.take_profit_2
    tp3_hits = highs >= prediction.take_profit_3

    first_stop = int(stop_hits.to_numpy().argmax()) if stop_hits.any() else None
    first_tp1 = int(tp1_hits.to_numpy().argmax()) if tp1_hits.any() else None

    # Conservative same-bar rule: a tie goes to the stop.
    stopped_out = first_stop is not None and (first_tp1 is None or first_stop <= first_tp1)

    hit_tp1 = first_tp1 is not None and not stopped_out
    # TP2/TP3 only count if reached strictly before any stop-out.
    hit_tp2 = _hit_before_stop(tp2_hits, first_stop)
    hit_tp3 = _hit_before_stop(tp3_hits, first_stop)

    realized_return_pct = float((window["close"].iloc[-1] / entry - 1) * 100) if entry else 0.0
    max_drawdown_pct = float(min((lows.min() / entry - 1) * 100, 0.0)) if entry else 0.0

    return Outcome(
        prediction_id=prediction.id,
        horizon_days=prediction.holding_period_days,
        realized_return_pct=realized_return_pct,
        hit_take_profit_1=bool(hit_tp1),
        hit_take_profit_2=bool(hit_tp2),
        hit_take_profit_3=bool(hit_tp3),
        hit_stop_loss=bool(stopped_out),
        max_drawdown_pct=max_drawdown_pct,
        notes=None,
    )


def _hit_before_stop(hits: pd.Series, first_stop: int | None) -> bool:
    if not hits.any():
        return False
    first_hit = int(hits.to_numpy().argmax())
    return first_stop is None or first_hit < first_stop


def build_calibration_report(db: Session, n_buckets: int = 5) -> dict:
    """Reliability report: for each predicted-probability bucket, how often
    did the +10% touch actually happen? A perfectly calibrated model has
    realized frequency ~= predicted probability in every bucket.
    """
    rows = (
        db.query(Prediction, Outcome)
        .join(Outcome, Outcome.prediction_id == Prediction.id)
        .all()
    )
    if not rows:
        return {
            "total_scored": 0,
            "buckets": [],
            "note": "No matured predictions with outcomes yet. Calibration populates as the outcome evaluator runs over time.",
        }

    buckets: list[dict] = []
    step = 1.0 / n_buckets
    for i in range(n_buckets):
        lo, hi = i * step, (i + 1) * step
        in_bucket = [
            (p, o) for p, o in rows
            if lo <= p.prob_up_10 < hi or (i == n_buckets - 1 and p.prob_up_10 == hi)
        ]
        if not in_bucket:
            buckets.append({"range": [round(lo, 2), round(hi, 2)], "count": 0})
            continue
        realized = sum(1 for _, o in in_bucket if o.hit_take_profit_1) / len(in_bucket)
        avg_predicted = sum(p.prob_up_10 for p, _ in in_bucket) / len(in_bucket)
        buckets.append(
            {
                "range": [round(lo, 2), round(hi, 2)],
                "count": len(in_bucket),
                "avg_predicted_prob": round(avg_predicted, 3),
                "realized_frequency": round(realized, 3),
                "calibration_gap": round(realized - avg_predicted, 3),
            }
        )

    stop_rate = sum(1 for _, o in rows if o.hit_stop_loss) / len(rows)
    avg_return = sum(o.realized_return_pct for _, o in rows) / len(rows)

    return {
        "total_scored": len(rows),
        "buckets": buckets,
        "overall_stop_rate": round(stop_rate, 3),
        "avg_realized_return_pct": round(avg_return, 2),
    }
