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
    MIN_SHADOW_CLOSED_SAMPLE,
    MIN_SHADOW_WIN_RATE_PCT,
    on_ncs_fired_autonomous,
)
from app.services.platform_settings import is_autonomous_trading_paused, set_autonomous_trading_paused
from app.services.risk.policy import RiskPolicy
from app.services.signals.ncs import NCS_VERSION
from app.services.shadow.engine import SHADOW_VERSION

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

    for i, sym in enumerate(["AAAA", "BBBB", "CCCC"]):
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
