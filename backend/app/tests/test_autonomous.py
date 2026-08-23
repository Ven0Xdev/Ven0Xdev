"""Autonomous paper trading — every gate must independently hold before an
account is ever acted on. See services/paper_trading/autonomous.py's
module docstring. Never a second execution path: every open/close here
routes through the same engine.open_position/close_position manual trades
use (test_paper_trading.py covers that engine's own guarantees)."""
from datetime import datetime, timedelta, timezone

import pytest

from app.db.models.ncs_signal import NcsSignal
from app.db.models.paper_trading import PaperPosition
from app.db.models.shadow_position import ShadowPosition
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.paper_trading import engine
from app.services.paper_trading.autonomous import (
    AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX,
    MAX_CONCURRENT_AUTONOMOUS_POSITIONS,
    on_ncs_fired_autonomous,
)
from app.services.platform_settings import is_autonomous_trading_paused, set_autonomous_trading_paused
from app.services.risk.policy import RiskPolicy
from app.services.shadow.engine import SHADOW_VERSION
from app.services.signals.ncs import NCS_VERSION

# BLKM reliably clears the default risk gate (confidence >= 65%, RR >=
# 2.0x) — the same deterministic mock-universe fixture symbol
# test_paper_trading.py uses, not chosen arbitrarily.
SYMBOL = "BLKM"


class _FakeOperator:
    id = 999


def _account(db, user_id=101, cash=100_000.0, autonomous=True):
    account = engine.start_new_simulation(user_id, cash, db)
    account.autonomous_trading_enabled = autonomous
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _seed_shadow_track_record(db, symbol=SYMBOL, timeframe="1D", wins=15, losses=5):
    """A closed-sample track record clearing MIN_SHADOW_CLOSED_SAMPLE at
    a win rate clearing MIN_SHADOW_WIN_RATE_PCT by default — callers that
    want a *failing* gate pass different wins/losses."""
    for i in range(wins + losses):
        ncs = NcsSignal(
            ticker_symbol=symbol, timeframe=timeframe, bar_ts=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=i),
            raw_verdict="BUY", confirmed_verdict="BUY", fired=True,
            composite_score=0.5, confidence_pct=70.0, risk_score=20.0, explanation="seed",
            components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
            data_source="mock", data_mode="synthetic",
        )
        db.add(ncs)
        db.commit()
        db.refresh(ncs)
        position = ShadowPosition(
            ncs_signal_id=ncs.id, ticker_symbol=symbol, timeframe=timeframe, direction="LONG",
            entry_bar_ts=ncs.bar_ts, entry_price=100.0, status="CLOSED",
            pnl_pct=0.05 if i < wins else -0.03, mfe_pct=0.06, mae_pct=-0.01,
            exit_bar_ts=ncs.bar_ts + timedelta(days=1), exit_price=105.0, exit_reason="max_holding_period",
            version=SHADOW_VERSION,
        )
        db.add(position)
    db.commit()


def _fired_row(db, symbol=SYMBOL, timeframe="1D", confirmed_verdict="STRONG_BUY", bar_ts=None):
    row = NcsSignal(
        ticker_symbol=symbol, timeframe=timeframe, bar_ts=bar_ts or datetime.now(timezone.utc),
        raw_verdict=confirmed_verdict, confirmed_verdict=confirmed_verdict, fired=True,
        composite_score=0.6, confidence_pct=75.0, risk_score=20.0, explanation="fired",
        components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------- platform-wide emergency stop ----------------------------------


def test_autonomous_trading_paused_state_defaults_to_false(db_session):
    assert is_autonomous_trading_paused(db_session) is False


def test_setting_the_pause_flag_is_read_back_immediately(db_session):
    set_autonomous_trading_paused(db_session, True, _FakeOperator())
    assert is_autonomous_trading_paused(db_session) is True
    set_autonomous_trading_paused(db_session, False, _FakeOperator())
    assert is_autonomous_trading_paused(db_session) is False


def test_no_db_session_fails_safe_paused(db_session):
    assert is_autonomous_trading_paused(None) is True


# ---------- per-simulation opt-in -----------------------------------------


def test_autonomous_trading_is_off_by_default_on_a_new_simulation(db_session):
    account = engine.start_new_simulation(user_id=1, starting_capital=10_000.0, db=db_session)
    assert account.autonomous_trading_enabled is False


def test_toggle_requires_an_active_simulation(db_session):
    from app.services.paper_trading.engine import PaperTradingError

    with pytest.raises(PaperTradingError):
        engine.set_autonomous_trading_enabled(user_id=42, enabled=True, db=db_session)


# ---------- on_ncs_fired_autonomous: gating ---------------------------------


def test_never_acts_while_the_platform_wide_emergency_stop_is_engaged(db_session):
    _account(db_session)
    _seed_shadow_track_record(db_session)
    set_autonomous_trading_paused(db_session, True, _FakeOperator())
    row = _fired_row(db_session)

    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert decisions == []


def test_never_acts_for_a_neutral_bucket(db_session):
    _account(db_session)
    row = _fired_row(db_session, confirmed_verdict="NEUTRAL")
    assert on_ncs_fired_autonomous(db_session, row, MockOTCProvider()) == []


def test_no_decisions_when_no_account_has_opted_in(db_session):
    _account(db_session, autonomous=False)
    _seed_shadow_track_record(db_session)
    row = _fired_row(db_session)
    assert on_ncs_fired_autonomous(db_session, row, MockOTCProvider()) == []


def test_declines_when_the_shadow_sample_is_too_small(db_session):
    _account(db_session)
    _seed_shadow_track_record(db_session, wins=5, losses=2)  # under MIN_SHADOW_CLOSED_SAMPLE
    row = _fired_row(db_session)

    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert len(decisions) == 1
    assert decisions[0].approved is False
    assert "closed signals" in decisions[0].reason
    assert engine.list_open_positions(101, db_session) == []


def test_declines_when_the_shadow_win_rate_is_too_low(db_session):
    _account(db_session)
    _seed_shadow_track_record(db_session, wins=8, losses=12)  # 40% — below MIN_SHADOW_WIN_RATE_PCT
    row = _fired_row(db_session)

    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert decisions[0].approved is False
    assert "win rate" in decisions[0].reason


def test_approves_and_opens_a_real_position_when_every_gate_clears(db_session):
    account = _account(db_session)
    _seed_shadow_track_record(db_session)
    row = _fired_row(db_session)

    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert len(decisions) == 1
    assert decisions[0].approved is True, decisions[0].reason
    position = decisions[0].position
    assert position is not None
    assert position.opened_by == "autonomous"
    assert position.ncs_signal_id == row.id
    assert position.account_id == account.id

    open_positions = engine.list_open_positions(101, db_session)
    assert len(open_positions) == 1
    assert open_positions[0].id == position.id


def test_position_size_targets_the_configured_fraction_of_the_risk_policys_own_ceiling(db_session):
    """Sizing is risk-based (from the stop-loss distance), not a fixed
    notional fraction of cash — the *dollar at risk* should land at
    AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX of RiskPolicy's own
    max_position_risk_pct, the exact ceiling evaluate_risk() enforces."""
    from app.services.scoring.scorer import analyze_ticker

    cash = 100_000.0
    _account(db_session, cash=cash)
    _seed_shadow_track_record(db_session)
    row = _fired_row(db_session)
    provider = MockOTCProvider()

    analysis = analyze_ticker(SYMBOL, provider=provider)
    decisions = on_ncs_fired_autonomous(db_session, row, provider)
    position = decisions[0].position
    assert position is not None, decisions[0].reason

    dollar_at_risk = position.quantity * abs(position.avg_entry_price - analysis.stop_loss)
    target = cash * (RiskPolicy.from_settings().max_position_risk_pct / 100.0) * AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX
    assert dollar_at_risk == pytest.approx(target, rel=0.05)


def test_never_opens_a_second_position_on_a_ticker_with_any_existing_open_position(db_session):
    account = _account(db_session)
    _seed_shadow_track_record(db_session)
    provider = MockOTCProvider()
    # A pre-existing MANUAL position on the same ticker.
    engine.open_position(account.user_id, SYMBOL, 1.0, db_session, provider)

    row = _fired_row(db_session)
    decisions = on_ncs_fired_autonomous(db_session, row, provider)
    assert decisions[0].approved is False
    assert "already has an open position" in decisions[0].reason


def test_never_exceeds_the_max_concurrent_autonomous_position_count(db_session):
    account = _account(db_session, cash=1_000_000.0)
    _seed_shadow_track_record(db_session, symbol="AAAA")
    _seed_shadow_track_record(db_session, symbol="BBBB")
    _seed_shadow_track_record(db_session, symbol="CCCC")
    _seed_shadow_track_record(db_session, symbol="DDDD")
    provider = MockOTCProvider()

    for sym in ["AAAA", "BBBB", "CCCC"]:
        db_session.add(
            PaperPosition(
                account_id=account.id, ticker_symbol=sym, quantity=1.0, avg_entry_price=10.0,
                status="open", opened_by="autonomous", risk_policy_version=RiskPolicy.from_settings().version,
            )
        )
    db_session.commit()
    assert MAX_CONCURRENT_AUTONOMOUS_POSITIONS == 3  # sanity: this test's setup matches the constant

    row = _fired_row(db_session, symbol="DDDD")
    decisions = on_ncs_fired_autonomous(db_session, row, provider)
    assert decisions[0].approved is False
    assert "already has 3 open autonomous positions" in decisions[0].reason


def test_a_sell_family_fired_row_closes_an_existing_autonomous_position(db_session):
    account = _account(db_session)
    _seed_shadow_track_record(db_session)
    provider = MockOTCProvider()

    buy_row = _fired_row(db_session, confirmed_verdict="STRONG_BUY")
    opened = on_ncs_fired_autonomous(db_session, buy_row, provider)[0].position
    assert opened is not None

    sell_row = _fired_row(db_session, confirmed_verdict="STRONG_SELL", bar_ts=buy_row.bar_ts + timedelta(days=1))
    decisions = on_ncs_fired_autonomous(db_session, sell_row, provider)
    assert len(decisions) == 1
    assert decisions[0].approved is True
    assert decisions[0].position.status == "closed"
    assert engine.list_open_positions(account.user_id, db_session) == []


def test_a_sell_family_fired_row_never_touches_a_manually_opened_position(db_session):
    account = _account(db_session)
    provider = MockOTCProvider()
    engine.open_position(account.user_id, SYMBOL, 1.0, db_session, provider)  # opened_by defaults to "manual"

    sell_row = _fired_row(db_session, confirmed_verdict="STRONG_SELL")
    decisions = on_ncs_fired_autonomous(db_session, sell_row, provider)
    assert decisions == []  # no autonomous position exists for this ticker — nothing to close
    assert len(engine.list_open_positions(account.user_id, db_session)) == 1
    assert engine.list_open_positions(account.user_id, db_session)[0].opened_by == "manual"


# ---------- end-to-end: evaluate_ncs firing actually reaches this module ---


def test_evaluate_ncs_firing_can_open_a_real_autonomous_position(db_session):
    """Proves the full wiring in services/signals/ncs.py's evaluate_ncs
    actually reaches on_ncs_fired_autonomous — not just that this module's
    own functions work in isolation."""
    from app.services.signals.ncs import _bucket, compute_ncs, evaluate_ncs

    account = _account(db_session)
    _seed_shadow_track_record(db_session, symbol=SYMBOL)
    provider = MockOTCProvider()

    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket != "BUY":
        pytest.skip(f"MockOTCProvider's current BLKM verdict is {c.raw_verdict!r}, not BUY — nothing to fire here")

    prior = NcsSignal(
        ticker_symbol=SYMBOL, timeframe="1D", bar_ts=c.bar_ts - timedelta(days=1),
        raw_verdict=c.raw_verdict, confirmed_verdict=None, fired=False,
        composite_score=0.3, confidence_pct=60.0, risk_score=20.0, explanation="seed",
        components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    db_session.add(prior)
    db_session.commit()

    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D", cooldown_minutes=60)
    assert row.fired is True

    autonomous_positions = (
        db_session.query(PaperPosition)
        .filter_by(account_id=account.id, opened_by="autonomous", ncs_signal_id=row.id)
        .all()
    )
    assert len(autonomous_positions) == 1


# ---------- regressions found by an independent review ---------------------


def test_db_rejects_a_second_open_autonomous_position_on_the_same_ticker(db_session):
    """The authoritative backstop for the TOCTOU race below — proves the
    partial unique index itself, independent of the application-level
    checks that normally prevent ever reaching it."""
    from sqlalchemy.exc import IntegrityError

    account = _account(db_session)
    ncs_row = _fired_row(db_session)

    db_session.add(PaperPosition(
        account_id=account.id, ticker_symbol=SYMBOL, quantity=1.0, avg_entry_price=10.0,
        status="open", opened_by="autonomous", ncs_signal_id=ncs_row.id,
        risk_policy_version=RiskPolicy.from_settings().version,
    ))
    db_session.commit()

    db_session.add(PaperPosition(
        account_id=account.id, ticker_symbol=SYMBOL, quantity=1.0, avg_entry_price=11.0,
        status="open", opened_by="autonomous", ncs_signal_id=ncs_row.id,
        risk_policy_version=RiskPolicy.from_settings().version,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_gracefully_declines_when_it_loses_a_race_to_open_a_duplicate_position(db_session, monkeypatch):
    """Simulates the TOCTOU window the account-row lock closes in
    practice: a conflicting row already exists, but the pre-check (and,
    to isolate this specific path, Red-Team's own independent
    duplicate-exposure check — see the test above proving that one also
    catches this scenario as defense-in-depth) are forced to not see
    it — proving the DB constraint + IntegrityError handling is a real
    backstop in its own right, not just theoretical, and that the
    session recovers cleanly afterward."""
    import app.services.paper_trading.autonomous as autonomous_module
    from app.services.risk.red_team import RedTeamVerdict

    account = _account(db_session)
    _seed_shadow_track_record(db_session)  # occupies bar_ts 2026-01-01 .. 2026-01-20
    winning_row = _fired_row(db_session, bar_ts=datetime(2026, 3, 1, tzinfo=timezone.utc))
    db_session.add(PaperPosition(
        account_id=account.id, ticker_symbol=SYMBOL, quantity=1.0, avg_entry_price=10.0,
        status="open", opened_by="autonomous", ncs_signal_id=winning_row.id,
        risk_policy_version=RiskPolicy.from_settings().version,
    ))
    db_session.commit()

    monkeypatch.setattr(autonomous_module, "_has_any_open_position", lambda *a, **k: False)
    monkeypatch.setattr(
        autonomous_module.red_team, "review",
        lambda *a, **k: RedTeamVerdict(vetoed=False, reason=None),
    )

    row = _fired_row(db_session, bar_ts=datetime(2026, 3, 2, tzinfo=timezone.utc))
    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert len(decisions) == 1
    assert decisions[0].approved is False
    assert "race" in decisions[0].reason.lower()

    # The session must have recovered from the aborted transaction — a
    # normal query still works, and only the original position exists.
    assert db_session.query(PaperPosition).filter_by(account_id=account.id, status="open").count() == 1


def test_red_team_also_independently_catches_the_same_duplicate_exposure(db_session, monkeypatch):
    """Defense-in-depth check: Red-Team's own duplicate-exposure gate
    (services/risk/red_team.py), driven by a real DB read of open
    positions, blocks a duplicate before the account-row lock or the DB
    constraint even need to — this passing is a *good* sign, not a test
    bug (see the test above for the isolated race-losing path)."""
    import app.services.paper_trading.autonomous as autonomous_module

    account = _account(db_session)
    _seed_shadow_track_record(db_session)
    winning_row = _fired_row(db_session, bar_ts=datetime(2026, 3, 1, tzinfo=timezone.utc))
    db_session.add(PaperPosition(
        account_id=account.id, ticker_symbol=SYMBOL, quantity=1.0, avg_entry_price=10.0,
        status="open", opened_by="autonomous", ncs_signal_id=winning_row.id,
        risk_policy_version=RiskPolicy.from_settings().version,
    ))
    db_session.commit()

    monkeypatch.setattr(autonomous_module, "_has_any_open_position", lambda *a, **k: False)

    row = _fired_row(db_session, bar_ts=datetime(2026, 3, 2, tzinfo=timezone.utc))
    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())

    assert len(decisions) == 1
    assert decisions[0].approved is False
    assert "red-team veto" in decisions[0].reason.lower()


def test_an_unexpected_error_in_the_close_path_is_recorded_not_raised(db_session, monkeypatch):
    """The sell/close branch used to be unwrapped, unlike the buy/open
    branch — any exception there escaped uncaught, violating this
    module's own 'never raises' contract and skipping every other
    account still left in the loop."""
    import app.services.paper_trading.autonomous as autonomous_module

    _account(db_session)
    _seed_shadow_track_record(db_session)
    buy_row = _fired_row(db_session, confirmed_verdict="STRONG_BUY")
    opened = on_ncs_fired_autonomous(db_session, buy_row, MockOTCProvider())[0].position
    assert opened is not None

    def _boom(*a, **k):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(autonomous_module, "_close_reversed_positions", _boom)

    sell_row = _fired_row(db_session, confirmed_verdict="STRONG_SELL", bar_ts=buy_row.bar_ts + timedelta(days=1))
    decisions = on_ncs_fired_autonomous(db_session, sell_row, MockOTCProvider())  # must not raise
    assert len(decisions) == 1
    assert decisions[0].approved is False
    assert "simulated failure" in decisions[0].reason


def test_emergency_stop_takes_effect_immediately_even_mid_loop(db_session, monkeypatch):
    """Proves the pause flag is re-read per-account, not just once before
    the loop starts — an operator's emergency stop committed by a
    concurrent request partway through a large fan-out must still take
    effect for every account not yet processed."""
    import app.services.paper_trading.autonomous as autonomous_module

    _account(db_session, user_id=201)
    _account(db_session, user_id=202)
    _seed_shadow_track_record(db_session)
    row = _fired_row(db_session)

    original = autonomous_module._evaluate_entry_for_account
    processed_accounts = []

    def _side_effect(db, account, ncs_row, provider):
        processed_accounts.append(account.id)
        set_autonomous_trading_paused(db, True, _FakeOperator())
        return original(db, account, ncs_row, provider)

    monkeypatch.setattr(autonomous_module, "_evaluate_entry_for_account", _side_effect)
    try:
        decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    finally:
        set_autonomous_trading_paused(db_session, False, _FakeOperator())

    assert len(processed_accounts) == 1  # only the first account reached before the pause took effect
    assert len(decisions) == 1


def test_a_dashboard_notification_failure_never_masks_an_already_committed_open(db_session, monkeypatch):
    _account(db_session)
    _seed_shadow_track_record(db_session)
    row = _fired_row(db_session)

    def _boom(*a, **k):
        raise RuntimeError("event bus down")

    monkeypatch.setattr("app.services.dashboard.events.publish_dashboard_event", _boom)

    decisions = on_ncs_fired_autonomous(db_session, row, MockOTCProvider())
    assert len(decisions) == 1
    assert decisions[0].approved is True, decisions[0].reason
    assert decisions[0].position is not None
    assert engine.list_open_positions(101, db_session)[0].id == decisions[0].position.id


def test_a_dashboard_notification_failure_never_masks_an_already_committed_close(db_session, monkeypatch):
    _account(db_session)
    _seed_shadow_track_record(db_session)
    provider = MockOTCProvider()
    buy_row = _fired_row(db_session, confirmed_verdict="STRONG_BUY")
    on_ncs_fired_autonomous(db_session, buy_row, provider)

    def _boom(*a, **k):
        raise RuntimeError("event bus down")

    monkeypatch.setattr("app.services.dashboard.events.publish_dashboard_event", _boom)

    sell_row = _fired_row(db_session, confirmed_verdict="STRONG_SELL", bar_ts=buy_row.bar_ts + timedelta(days=1))
    decisions = on_ncs_fired_autonomous(db_session, sell_row, provider)
    assert len(decisions) == 1
    assert decisions[0].approved is True, decisions[0].reason
    assert decisions[0].position.status == "closed"
    assert engine.list_open_positions(101, db_session) == []


def test_shadow_track_record_under_a_different_ncs_version_never_counts(db_session):
    """A track record built entirely under an old NCS scoring algorithm
    must not clear the gate for a newer, functionally different one."""
    _account(db_session)
    _seed_shadow_track_record(db_session)  # stamped with the current NCS_VERSION by default

    old_row = _fired_row(db_session)
    old_row.version = "ncs-0.0.1-old"
    db_session.add(old_row)
    db_session.commit()

    decisions = on_ncs_fired_autonomous(db_session, old_row, MockOTCProvider())
    assert len(decisions) == 1
    assert decisions[0].approved is False
    assert "closed signals" in decisions[0].reason
