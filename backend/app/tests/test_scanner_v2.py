"""Scanner v2: quality gates + recorded accept/reject decisions."""
from app.db.models.prediction import Prediction
from app.db.models.scan import ScanCycle, ScanDecision
from app.schemas.stock import StockAnalysis, HorizonProbabilities
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.quality_gates import evaluate_quality_gates
from app.workers.scan_scheduler import run_scan_cycle


def _analysis(**overrides) -> StockAnalysis:
    base = dict(
        ticker="TEST", company_name="Test Co", current_price=1.0, tier="Pink", sector="Tech",
        liquidity_score=60, manipulation_risk=20, fundamental_score=50, technical_score=50,
        sentiment_score=50, catalyst_score=40, overall_ai_score=55, confidence_score=60,
        probability_matrix=[HorizonProbabilities(horizon_days=10, prob_up_5=0.4, prob_up_10=0.3, prob_up_20=0.15)],
        probability_downside_before_upside=0.4,
        suggested_entry_zone_low=0.98, suggested_entry_zone_high=1.02, ideal_entry_price=1.0,
        stop_loss=0.9, take_profit_1=1.1, take_profit_2=1.2, take_profit_3=1.35,
        max_allocation_pct=2.0, expected_risk_reward=2.0, estimated_holding_period_days=10,
        explanation="x", manipulation_flags=[], top_factors=[],
    )
    base.update(overrides)
    return StockAnalysis(**base)


def test_gates_accept_healthy_ticker_with_rationale():
    decision = evaluate_quality_gates(_analysis())
    assert decision.accepted
    assert decision.reasons and "Passed all quality gates" in decision.reasons[0]


def test_gates_reject_each_failure_mode_with_named_reason():
    cases = [
        (dict(current_price=0.0001), "Sub-tick"),
        (dict(manipulation_risk=85), "Manipulation risk"),
        (dict(liquidity_score=5), "Liquidity"),
        (dict(confidence_score=10), "confidence"),
    ]
    for overrides, expected_fragment in cases:
        decision = evaluate_quality_gates(_analysis(**overrides))
        assert not decision.accepted
        assert any(expected_fragment.lower() in r.lower() for r in decision.reasons), overrides


def test_gates_do_not_reject_weak_but_tradeable_scores():
    # A low AI score is information, not a rejection reason.
    decision = evaluate_quality_gates(_analysis(overall_ai_score=15))
    assert decision.accepted


def test_scan_cycle_records_every_decision(db_session):
    provider = MockOTCProvider()
    analyzed = run_scan_cycle(provider=provider, db=db_session)
    assert analyzed == len(provider.get_universe())

    cycle = db_session.query(ScanCycle).order_by(ScanCycle.id.desc()).first()
    assert cycle is not None
    assert cycle.finished_at is not None
    decisions = db_session.query(ScanDecision).filter_by(cycle_id=cycle.id).all()
    assert len(decisions) == analyzed
    assert cycle.accepted_count + cycle.rejected_count + cycle.failed_count == analyzed

    for d in decisions:
        assert d.reasons, f"{d.ticker_symbol} has no recorded reasons"
    accepted = [d for d in decisions if d.decision == "accepted"]
    ranks = sorted(d.rank for d in accepted)
    assert ranks == list(range(1, len(accepted) + 1))  # dense ranking, 1 = best


def test_predictions_logged_only_for_accepted(db_session):
    provider = MockOTCProvider()
    run_scan_cycle(provider=provider, db=db_session)
    cycle = db_session.query(ScanCycle).order_by(ScanCycle.id.desc()).first()
    accepted = {
        d.ticker_symbol
        for d in db_session.query(ScanDecision).filter_by(cycle_id=cycle.id, decision="accepted")
    }
    logged = {p.ticker_symbol for p in db_session.query(Prediction).all()}
    assert logged == accepted


def test_prediction_snapshot_carries_features(db_session):
    provider = MockOTCProvider()
    run_scan_cycle(provider=provider, db=db_session)
    prediction = db_session.query(Prediction).first()
    assert prediction is not None
    from app.services.ml.feature_vector import FEATURE_NAMES

    assert all(name in prediction.feature_snapshot for name in FEATURE_NAMES)
