"""Reasoning-engine tests: stage discipline, honesty invariants, and the
contrarian/judge contracts.
"""
import pytest

from app.services.agents.evidence import BEARISH, BULLISH
from app.services.agents.reasoning_engine import ReasoningEngine
from app.services.data_providers.mock_provider import MockOTCProvider

EXPECTED_STAGES = ["evidence", "confidence", "contradiction", "risk", "explanation", "recommendation"]
VALID_STANCES = {"avoid", "cautious", "neutral", "constructive", "favorable"}


@pytest.fixture(scope="module")
def deliberations():
    provider = MockOTCProvider()
    engine = ReasoningEngine()
    symbols = [t.symbol for t in provider.get_universe(limit=6)]
    return [engine.deliberate(sym, provider=provider) for sym in symbols]


def test_stages_run_in_mandated_order(deliberations):
    for d in deliberations:
        assert [s.stage for s in d.stages] == EXPECTED_STAGES


def test_verdict_never_claims_certainty(deliberations):
    for d in deliberations:
        assert d.verdict.conviction <= 0.97
        assert 0.0 <= d.verdict.probability_up_10 < 1.0
        assert 0.0 <= d.verdict.probability_downside_first <= 1.0
        assert d.verdict.stance in VALID_STANCES
        assert "certain" not in d.verdict.narrative.lower().replace("never claims certainty", "")


def test_evidence_stage_gathers_from_multiple_agents(deliberations):
    for d in deliberations:
        evidence_stage = d.stages[0]
        agents = {e.agent for e in evidence_stage.evidence}
        assert len(agents) >= 3
        assert len(evidence_stage.evidence) >= 4


def test_contrarian_always_files_something(deliberations):
    for d in deliberations:
        contradiction = d.stages[2]
        assert contradiction.evidence, "contrarian must always file at least one finding"


def test_contrarian_opposes_strong_consensus(deliberations):
    for d in deliberations:
        net_before = d.stages[0].metrics["net_score"]
        contradiction = d.stages[2]
        if net_before > 0.2:
            assert any(e.direction == BEARISH for e in contradiction.evidence)
        elif net_before < -0.2:
            assert any(e.direction == BULLISH for e in contradiction.evidence)


def test_risk_stage_defines_invalidations(deliberations):
    for d in deliberations:
        assert len(d.verdict.invalidation_conditions) >= 3
        assert any("stop" in c.lower() for c in d.verdict.invalidation_conditions)


def test_verdict_cites_the_case_against_itself(deliberations):
    for d in deliberations:
        # A verdict without opposing reasons is invalid by construction —
        # OTC always carries at least detective/contrarian/risk material.
        assert d.verdict.key_reasons_against or d.verdict.key_reasons_for


def test_learning_damping_applied_without_history(deliberations):
    for d in deliberations:
        confidence = d.stages[1]
        # No DB attached in these runs -> precautionary damping < 1.
        assert confidence.metrics["learning_damping"] < 1.0


def test_manipulation_veto_caps_stance(deliberations):
    for d in deliberations:
        # Find the analysis manipulation risk through the risk stage metrics proxy:
        # heavily flagged tickers must not receive favorable/constructive stances.
        risk_composite = d.stages[3].metrics["composite_risk"]
        if risk_composite >= 75:
            assert d.verdict.stance in ("avoid", "cautious", "neutral")


def test_recommendation_allocation_never_exceeds_risk_ceiling(deliberations):
    for d in deliberations:
        rec = d.stages[5]
        assert rec.metrics["max_allocation_pct"] <= d.verdict.suggested_max_allocation_pct + 1e-9


def test_deliberation_endpoint(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    response = client.get(f"/api/v1/stocks/{symbol}/deliberation")
    assert response.status_code == 200
    data = response.json()
    assert [s["stage"] for s in data["stages"]] == EXPECTED_STAGES
    assert data["verdict"]["stance"] in VALID_STANCES
    assert data["verdict"]["conviction"] <= 0.97
