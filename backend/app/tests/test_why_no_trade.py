"""Paper Trading "Why no trade?" diagnostic
(services/paper_trading/why_no_trade.py) — read-only, must never open or
close anything, and must report the exact gate blocking an entry."""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.paper_trading import engine
from app.services.paper_trading.why_no_trade import why_no_trade

SYMBOL = "BLKM"  # clears the default risk gate — same fixture symbol test_paper_trading.py uses


class _FakeOperator:
    id = 999


def _account(db, user_id=101, cash=100_000.0, autonomous=True):
    account = engine.start_new_simulation(user_id, cash, db)
    account.autonomous_trading_enabled = autonomous
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def test_reports_no_ncs_signal_as_the_blocker_when_nothing_has_fired(db_session):
    account = _account(db_session)
    provider = MockOTCProvider()

    report = why_no_trade(db_session, account, SYMBOL, "1D", provider)

    assert report.permitted is False
    assert report.ncs_fired is False
    assert any("ncs_signal" == g.name and not g.passed for g in report.gates)
    assert not any("no autonomous positions" in b.lower() for b in report.blockers)  # never a fabricated reason


def test_never_opens_or_closes_any_position(db_session):
    account = _account(db_session)
    provider = MockOTCProvider()

    why_no_trade(db_session, account, SYMBOL, "1D", provider)

    assert engine.list_open_positions(101, db_session) == []


def test_reports_emergency_stop_as_a_distinct_gate_from_account_opt_in(db_session):
    from app.services.platform_settings import set_autonomous_trading_paused

    set_autonomous_trading_paused(db_session, True, _FakeOperator())
    account = _account(db_session, autonomous=False)
    provider = MockOTCProvider()

    report = why_no_trade(db_session, account, SYMBOL, "1D", provider)

    gate_names = {g.name: g.passed for g in report.gates}
    assert gate_names["emergency_stop"] is False
    assert gate_names["account_opt_in"] is False


def test_reports_critical_drift_via_the_red_team_gate(db_session, monkeypatch):
    # Two independent call sites read drift status: red_team.py's own
    # top-level `from ... import drift_status_label` binding (used for the
    # veto itself) and why_no_trade.py's local import (used for the
    # `drift_status` field this test also asserts on) — both need patching.
    monkeypatch.setattr("app.services.risk.red_team.drift_status_label", lambda db: "significant")
    monkeypatch.setattr("app.services.monitoring.drift.drift_status_label", lambda db: "significant")
    account = _account(db_session)
    provider = MockOTCProvider()

    report = why_no_trade(db_session, account, SYMBOL, "1D", provider)

    assert report.drift_status == "significant"
    assert report.permitted is False
    assert "drift" in report.red_team_result.lower()
    red_team_gate = next(g for g in report.gates if g.name == "red_team")
    assert red_team_gate.passed is False


def test_reports_shadow_sample_size_and_win_rate_honestly_when_empty(db_session):
    account = _account(db_session)
    provider = MockOTCProvider()

    report = why_no_trade(db_session, account, SYMBOL, "1D", provider)

    assert report.shadow_sample_size == 0
    assert report.shadow_win_rate_pct is None
