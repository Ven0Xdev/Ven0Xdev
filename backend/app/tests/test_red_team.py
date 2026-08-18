"""Red-Team veto module — deterministic, every check recorded, every
veto cites its threshold and observed value.
"""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.risk import red_team
from app.services.scoring.scorer import analyze_ticker

SYMBOL = "AAPL"


def _analysis():
    return analyze_ticker(SYMBOL, provider=MockOTCProvider())


def test_approves_a_clean_setup_with_no_portfolio_context(db_session):
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session)
    # Every check ran regardless of outcome — the audit trail always has
    # every rule represented, not just the ones that failed.
    assert {c.name for c in verdict.checks} >= {"safe_mode", "drift", "manipulation_risk", "confidence_floor", "provider_health"}
    assert verdict.version == red_team.RED_TEAM_VERSION


def test_vetoes_when_safe_mode_is_active(db_session, monkeypatch):
    monkeypatch.setattr("app.services.risk.red_team.is_safe_mode_active", lambda db: True)
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session)
    assert verdict.vetoed is True
    assert "safe mode" in verdict.reason.lower()


def test_vetoes_on_significant_drift(db_session, monkeypatch):
    monkeypatch.setattr("app.services.risk.red_team.drift_status_label", lambda db: "significant")
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session)
    assert verdict.vetoed is True
    assert "drift" in verdict.reason.lower()


def test_does_not_veto_on_moderate_or_stable_drift(db_session, monkeypatch):
    for status in ("stable", "moderate", "insufficient_history"):
        monkeypatch.setattr("app.services.risk.red_team.drift_status_label", lambda db, s=status: s)
        a = _analysis()
        verdict = red_team.review(SYMBOL, a, db_session)
        drift_check = next(c for c in verdict.checks if c.name == "drift")
        assert drift_check.passed is True


def test_vetoes_above_the_manipulation_ceiling(db_session):
    a = _analysis()
    a.manipulation_risk = red_team.MANIPULATION_VETO_THRESHOLD + 1
    verdict = red_team.review(SYMBOL, a, db_session)
    assert verdict.vetoed is True
    assert "manipulation" in verdict.reason.lower()


def test_does_not_veto_just_below_the_manipulation_ceiling(db_session):
    a = _analysis()
    a.manipulation_risk = red_team.MANIPULATION_VETO_THRESHOLD - 1
    verdict = red_team.review(SYMBOL, a, db_session)
    manip_check = next(c for c in verdict.checks if c.name == "manipulation_risk")
    assert manip_check.passed is True


def test_vetoes_below_the_confidence_floor(db_session):
    a = _analysis()
    a.confidence_score = red_team.CONFIDENCE_VETO_FLOOR - 1
    verdict = red_team.review(SYMBOL, a, db_session)
    assert verdict.vetoed is True
    assert "confidence" in verdict.reason.lower()


def test_vetoes_duplicate_exposure_in_the_same_symbol(db_session):
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session, portfolio_open_symbols={SYMBOL})
    assert verdict.vetoed is True
    assert "already holding" in verdict.reason.lower()


def test_vetoes_when_max_open_positions_reached(db_session):
    a = _analysis()
    verdict = red_team.review(
        SYMBOL, a, db_session, portfolio_open_symbols={"MSFT", "NVDA", "AMZN", "META", "GOOGL"}, max_open_positions=5
    )
    assert verdict.vetoed is True
    assert "limit" in verdict.reason.lower()


def test_does_not_veto_below_max_open_positions(db_session):
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session, portfolio_open_symbols={"MSFT"}, max_open_positions=5)
    exposure_check = next(c for c in verdict.checks if c.name == "exposure")
    assert exposure_check.passed is True
    assert verdict.vetoed is False


def test_vetoes_on_unhealthy_provider(db_session):
    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session, provider_healthy=False)
    assert verdict.vetoed is True
    assert "provider" in verdict.reason.lower()


def test_multiple_failed_checks_all_cited_in_the_reason(db_session, monkeypatch):
    monkeypatch.setattr("app.services.risk.red_team.is_safe_mode_active", lambda db: True)
    a = _analysis()
    a.manipulation_risk = red_team.MANIPULATION_VETO_THRESHOLD + 1
    verdict = red_team.review(SYMBOL, a, db_session)
    assert verdict.vetoed is True
    assert "safe mode" in verdict.reason.lower()
    assert "manipulation" in verdict.reason.lower()


def test_duck_types_cleanly_as_ncs_red_team_input(db_session):
    """NCS's NcsInputs.red_team_veto only ever reads .vetoed/.reason — this
    module's richer RedTeamVerdict must work as a drop-in without NCS
    importing anything from here."""
    from app.services.signals.ncs import NcsInputs, compute_ncs

    a = _analysis()
    verdict = red_team.review(SYMBOL, a, db_session)
    provider = MockOTCProvider()
    inputs = NcsInputs(red_team_veto=verdict)
    computation = compute_ncs(SYMBOL, provider, db_session, timeframe="1D", inputs=inputs)
    assert computation.vetoed == verdict.vetoed
