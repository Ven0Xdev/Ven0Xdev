"""Single constructor for Prediction rows — the worker and the API endpoint
must write byte-identical snapshots, so the mapping lives exactly once.
"""
from __future__ import annotations

from app.db.models.prediction import Prediction
from app.schemas.stock import StockAnalysis


def build_prediction_row(analysis: StockAnalysis) -> Prediction:
    primary = next(
        (p for p in analysis.probability_matrix if p.horizon_days == analysis.estimated_holding_period_days),
        analysis.probability_matrix[0],
    )
    return Prediction(
        ticker_symbol=analysis.ticker,
        current_price=analysis.current_price,
        liquidity_score=analysis.liquidity_score,
        manipulation_risk=analysis.manipulation_risk,
        fundamental_score=analysis.fundamental_score,
        technical_score=analysis.technical_score,
        sentiment_score=analysis.sentiment_score,
        catalyst_score=analysis.catalyst_score,
        overall_ai_score=analysis.overall_ai_score,
        confidence_score=analysis.confidence_score,
        prob_up_5=primary.prob_up_5,
        prob_up_10=primary.prob_up_10,
        prob_up_20=primary.prob_up_20,
        prob_downside_before_upside=analysis.probability_downside_before_upside,
        entry_zone_low=analysis.suggested_entry_zone_low,
        entry_zone_high=analysis.suggested_entry_zone_high,
        ideal_entry_price=analysis.ideal_entry_price,
        stop_loss=analysis.stop_loss,
        take_profit_1=analysis.take_profit_1,
        take_profit_2=analysis.take_profit_2,
        take_profit_3=analysis.take_profit_3,
        max_allocation_pct=analysis.max_allocation_pct,
        risk_reward=analysis.expected_risk_reward,
        holding_period_days=analysis.estimated_holding_period_days,
        explanation=analysis.explanation,
        horizon_probabilities={str(p.horizon_days): p.model_dump() for p in analysis.probability_matrix},
        feature_snapshot=analysis.feature_vector,
        shap_top_factors={"factors": [f.model_dump() for f in analysis.top_factors]},
    )
