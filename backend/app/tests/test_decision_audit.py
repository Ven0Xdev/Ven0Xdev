"""Unified Decision Audit (services/signals/decision_audit.py) — every
real persisted NCS evaluation, enriched with its Shadow/paper-order
outcome. Never fabricates a row for a ticker/timeframe with no
evaluations."""
from datetime import datetime, timedelta, timezone

from app.db.models.ncs_signal import NcsSignal
from app.db.models.shadow_position import ShadowPosition
from app.services.shadow.engine import SHADOW_VERSION
from app.services.signals.decision_audit import decision_audit
from app.services.signals.ncs import NCS_VERSION

SYMBOL = "DECISIONAUDITTEST"
BASE_TS = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _ncs_row(db, **overrides):
    defaults = dict(
        ticker_symbol=SYMBOL, timeframe="1D", bar_ts=BASE_TS,
        raw_verdict="BUY", confirmed_verdict="BUY", fired=True,
        composite_score=0.5, confidence_pct=70.0, risk_score=25.0, explanation="test",
        components=[{"name": "trend_structure", "score": 1.0, "weight": 0.16, "detail": "x"}],
        vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    defaults.update(overrides)
    row = NcsSignal(**defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_empty_when_nothing_has_ever_been_evaluated(db_session):
    assert decision_audit(db_session, "NEVEREVALUATED", "1D") == []


def test_reports_the_honest_state_for_every_evaluation_outcome(db_session):
    fired = _ncs_row(db_session, bar_ts=BASE_TS, fired=True, confirmed_verdict="BUY")
    vetoed = _ncs_row(
        db_session, bar_ts=BASE_TS + timedelta(days=1), fired=False, vetoed=True,
        veto_reason="Drift status is 'significant'.", confirmed_verdict="BUY",
    )
    awaiting = _ncs_row(db_session, bar_ts=BASE_TS + timedelta(days=2), fired=False, confirmed_verdict=None)
    no_trade = _ncs_row(
        db_session, bar_ts=BASE_TS + timedelta(days=3), fired=False, confirmed_verdict="BUY", vetoed=False,
    )

    rows = decision_audit(db_session, SYMBOL, "1D")
    by_id = {r.id: r for r in rows}
    assert by_id[fired.id].state == "fired"
    assert by_id[vetoed.id].state == "vetoed"
    assert by_id[vetoed.id].veto_reason == "Drift status is 'significant'."
    assert by_id[awaiting.id].state == "awaiting_confirmation"
    assert by_id[no_trade.id].state == "no_trade"


def test_enriches_a_fired_row_with_its_shadow_observation(db_session):
    row = _ncs_row(db_session, bar_ts=BASE_TS, fired=True)
    shadow = ShadowPosition(
        ncs_signal_id=row.id, ticker_symbol=SYMBOL, timeframe="1D", direction="LONG",
        entry_bar_ts=row.bar_ts, entry_price=10.0, status="CLOSED",
        pnl_pct=0.08, mfe_pct=0.10, mae_pct=-0.01,
        exit_bar_ts=row.bar_ts + timedelta(days=5), exit_price=10.8, exit_reason="max_holding_period",
        version=SHADOW_VERSION,
    )
    db_session.add(shadow)
    db_session.commit()

    [audited] = decision_audit(db_session, SYMBOL, "1D")
    assert audited.shadow_status == "CLOSED"
    assert audited.shadow_pnl_pct == 0.08
    assert audited.shadow_exit_reason == "max_holding_period"
    assert audited.shadow_maturity_bar_ts == shadow.exit_bar_ts


def test_never_fabricates_shadow_data_for_a_row_that_never_fired(db_session):
    _ncs_row(db_session, bar_ts=BASE_TS, fired=False, confirmed_verdict=None)

    [audited] = decision_audit(db_session, SYMBOL, "1D")
    assert audited.shadow_status is None
    assert audited.shadow_pnl_pct is None


def test_decision_audit_endpoint_reports_the_current_platform_drift_status(client):
    """The HTTP endpoint composes decision_audit() with the same
    drift_status_label() Red-Team's veto check and Why-No-Trade already
    use — never a fabricated or hardcoded value."""
    res = client.get(f"/api/v1/stream/{SYMBOL}/decision-audit")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["current_drift_status"] in {"insufficient_history", "stable", "moderate", "significant"}
    assert "eligibility_progress" in body
    assert "rows" in body
