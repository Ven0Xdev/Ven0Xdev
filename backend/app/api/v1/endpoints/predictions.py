from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, require_operator
from app.db.models.prediction import Outcome, Prediction
from app.schemas.prediction import ModelPerformanceSummary, PredictionOut
from app.services.data_providers.base import MarketDataProvider
from app.services.evaluation.outcome_evaluator import build_calibration_report, evaluate_due_predictions
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.post("/evaluate-outcomes")
def evaluate_outcomes(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    _operator=Depends(require_operator),
):
    """Grade every matured prediction against realized price history.
    Runs automatically each scan cycle; this endpoint triggers it on demand.
    """
    summary = evaluate_due_predictions(db, provider)
    return {
        "evaluated": summary.evaluated,
        "skipped_immature": summary.skipped_immature,
        "skipped_no_data": summary.skipped_no_data,
    }


@router.get("/calibration")
def calibration_report(db: Session = Depends(db_session)):
    """Reliability report: predicted probability vs. realized frequency of
    the +10% touch, bucketed. The honest measure of whether the platform's
    probabilities mean anything.
    """
    return build_calibration_report(db)


@router.post("/log/{symbol}", response_model=PredictionOut)
def log_prediction(symbol: str, db: Session = Depends(db_session)):
    """Snapshot the current AI analysis for a ticker into the immutable
    prediction log, so it can later be scored against realized outcomes.
    """
    try:
        analysis = analyze_ticker(symbol)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    from app.services.scoring.prediction_log import build_prediction_row

    prediction = build_prediction_row(analysis)
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    return PredictionOut(
        id=prediction.id,
        ticker_symbol=prediction.ticker_symbol,
        created_at=prediction.created_at,
        current_price=prediction.current_price,
        overall_ai_score=prediction.overall_ai_score,
        confidence_score=prediction.confidence_score,
        manipulation_risk=prediction.manipulation_risk,
        prob_up_10=prediction.prob_up_10,
        explanation=prediction.explanation,
        engine_mode=prediction.engine_mode,
        model_version=prediction.model_version,
        risk_policy_version=prediction.risk_policy_version,
    )


@router.get("/history/{symbol}", response_model=list[PredictionOut])
def prediction_history(symbol: str, limit: int = 50, db: Session = Depends(db_session)):
    rows = (
        db.query(Prediction)
        .filter_by(ticker_symbol=symbol.upper())
        .order_by(Prediction.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        PredictionOut(
            id=r.id,
            ticker_symbol=r.ticker_symbol,
            created_at=r.created_at,
            current_price=r.current_price,
            overall_ai_score=r.overall_ai_score,
            confidence_score=r.confidence_score,
            manipulation_risk=r.manipulation_risk,
            prob_up_10=r.prob_up_10,
            explanation=r.explanation,
            engine_mode=r.engine_mode,
            model_version=r.model_version,
            risk_policy_version=r.risk_policy_version,
        )
        for r in rows
    ]


@router.get("/model-performance", response_model=ModelPerformanceSummary)
def model_performance(db: Session = Depends(db_session)):
    total_predictions = db.query(Prediction).count()
    outcomes = db.query(Outcome).all()

    if not outcomes:
        return ModelPerformanceSummary(
            total_predictions=total_predictions,
            total_outcomes=0,
            avg_realized_return_pct=None,
            hit_rate_take_profit_1_pct=None,
            hit_rate_stop_loss_pct=None,
            note="No realized outcomes logged yet. Model performance populates as predictions are evaluated against actual price history.",
        )

    avg_return = sum(o.realized_return_pct for o in outcomes) / len(outcomes)
    tp1_rate = sum(o.hit_take_profit_1 for o in outcomes) / len(outcomes) * 100
    stop_rate = sum(o.hit_stop_loss for o in outcomes) / len(outcomes) * 100

    return ModelPerformanceSummary(
        total_predictions=total_predictions,
        total_outcomes=len(outcomes),
        avg_realized_return_pct=avg_return,
        hit_rate_take_profit_1_pct=tp1_rate,
        hit_rate_stop_loss_pct=stop_rate,
    )
