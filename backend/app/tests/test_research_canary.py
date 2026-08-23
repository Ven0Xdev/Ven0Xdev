"""services/research/canary.py — the Research Canary's safety gate chain.
Proves every non-negotiable Phase 6 rule is enforced on the BACKEND at
decision time: Emergency Stop blocks execution, the operator opt-in is
required, stale data means NO_TRADE, mandatory stop-loss can't be
bypassed, position/day and concurrent-position caps hold, daily-loss and
peak-to-trough auto-pause actually trigger, and no averaging down."""
from datetime import datetime, timedelta, timezone

import pytest

from app.db.models.canary import CanaryAccount, CanaryPosition
from app.db.models.platform_setting import PlatformSetting
from app.db.models.research_model import ResearchModel
from app.services.research.canary import (
    CONFIDENCE_FLOOR,
    MAX_CONCURRENT_POSITIONS,
    MAX_DAILY_LOSS_PCT,
    MAX_NEW_POSITIONS_PER_DAY,
    close_canary_position,
    evaluate_canary_entry,
    get_or_create_account,
    open_canary_position,
)

NOW = datetime(2026, 6, 15, 15, 0, tzinfo=timezone.utc)


def _qualified_model(db, horizon="1d") -> ResearchModel:
    model = ResearchModel(family="lightgbm", horizon=horizon, version="test", state="HISTORICALLY_QUALIFIED")
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def _engage_emergency_stop(db, paused: bool) -> None:
    setting = db.query(PlatformSetting).filter_by(id=1).one_or_none()
    if setting is None:
        setting = PlatformSetting(id=1)
        db.add(setting)
    setting.autonomous_trading_paused = paused
    db.commit()


def _enable_canary(db) -> CanaryAccount:
    account = get_or_create_account(db)
    account.enabled = True
    db.commit()
    return account


class TestEmergencyStopAndOptIn:
    def test_emergency_stop_engaged_blocks_even_a_perfect_setup(self, db_session):
        model = _qualified_model(db_session)
        _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=True)

        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert result.permitted is False
        assert any("emergency stop" in r.lower() for r in result.reasons)
        assert result.decision.fired is False

    def test_no_platform_setting_row_fails_closed_as_paused(self, db_session):
        model = _qualified_model(db_session)
        _enable_canary(db_session)
        # No PlatformSetting row at all — must fail closed (paused), never
        # silently treat "unknown" as "resumed." Explicitly cleared rather
        # than assumed absent: this table's id=1 singleton row can already
        # exist on the shared test connection by the time this test runs,
        # depending on full-suite test order (see conftest.py's db_session
        # fixture docstring on cross-test leakage via a shared StaticPool
        # connection) — the guarantee this test is actually proving only
        # holds if the row is genuinely gone right here.
        db_session.query(PlatformSetting).delete()
        db_session.commit()

        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert result.permitted is False
        assert any("emergency stop" in r.lower() for r in result.reasons)

    def test_canary_not_enabled_blocks_even_with_emergency_stop_resumed(self, db_session):
        model = _qualified_model(db_session)
        _engage_emergency_stop(db_session, paused=False)
        # get_or_create_account defaults enabled=False — never opted in.
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert result.permitted is False
        assert any("not enabled" in r.lower() for r in result.reasons)

    def test_both_gates_satisfied_permits_a_qualifying_decision(self, db_session):
        model = _qualified_model(db_session)
        _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert result.permitted is True
        assert result.decision.fired is True
        assert result.decision.verdict == "BUY"


class TestDataQualityAndConfidence:
    def _ready(self, db_session):
        model = _qualified_model(db_session)
        _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)
        return model

    def test_stale_quote_is_no_trade(self, db_session):
        model = self._ready(db_session)
        stale_quote_ts = NOW - timedelta(seconds=600)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, stale_quote_ts, now=NOW)
        assert result.permitted is False
        assert any("stale" in r.lower() for r in result.reasons)
        assert result.decision.data_stale is True

    def test_below_confidence_floor_is_no_trade(self, db_session):
        model = self._ready(db_session)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", CONFIDENCE_FLOOR - 0.01, NOW, now=NOW)
        assert result.permitted is False
        assert any("confidence" in r.lower() for r in result.reasons)

    def test_only_qualified_or_live_shadow_models_can_fire(self, db_session):
        model = ResearchModel(family="lightgbm", horizon="1d", version="test", state="REJECTED_OVERFIT")
        db_session.add(model)
        db_session.commit()
        db_session.refresh(model)
        _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert result.permitted is False
        assert any("research model state" in r.lower() for r in result.reasons)


class TestPositionLimitsAndSizing:
    def _ready_account(self, db_session):
        model = _qualified_model(db_session)
        account = _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)
        return model, account

    def test_mandatory_stop_loss_above_entry_is_rejected(self, db_session):
        model, account = self._ready_account(db_session)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        with pytest.raises(ValueError, match="long-only"):
            open_canary_position(
                db_session, account, result.decision, entry_price=100.0, stop_loss=105.0,
                max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
            )

    def test_position_size_never_exceeds_the_max_risk_per_trade_budget(self, db_session):
        model, account = self._ready_account(db_session)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        position = open_canary_position(
            db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
            max_holding_days=1, take_profit=110.0, data_source="test", data_mode="test", now=NOW,
        )
        max_allowed_risk = account.starting_balance * (0.25 / 100)
        assert position.risk_dollars_at_entry <= max_allowed_risk + 1e-6

    def test_cannot_average_down_into_an_existing_open_position(self, db_session):
        model, account = self._ready_account(db_session)
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        open_canary_position(
            db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
            max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
        )
        second = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        assert second.permitted is False
        assert any("averaging" in r.lower() for r in second.reasons)

    def test_max_concurrent_positions_enforced_across_different_tickers(self, db_session):
        # MAX_NEW_POSITIONS_PER_DAY is stricter than MAX_CONCURRENT_POSITIONS
        # in this configuration, so reaching the concurrent cap at all
        # requires spreading the opens across separate days (each day's
        # own 1-per-day cap resets) — this test is specifically isolating
        # the CONCURRENT limit, not the daily one (see the next test for that).
        model, account = self._ready_account(db_session)
        tickers = [f"SYM{i}" for i in range(MAX_CONCURRENT_POSITIONS)]
        for i, ticker in enumerate(tickers):
            day = NOW + timedelta(days=i)
            result = evaluate_canary_entry(db_session, model, ticker, "1d", 0.9, day, now=day)
            assert result.permitted is True
            open_canary_position(
                db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
                max_holding_days=30, take_profit=None, data_source="test", data_mode="test", now=day,
            )
        overflow_day = NOW + timedelta(days=len(tickers))
        overflow = evaluate_canary_entry(db_session, model, "OVERFLOW", "1d", 0.9, overflow_day, now=overflow_day)
        assert overflow.permitted is False
        assert any("limit" in r.lower() for r in overflow.reasons)

    def test_max_new_positions_per_day_enforced_across_different_tickers(self, db_session):
        model, account = self._ready_account(db_session)
        for i in range(MAX_NEW_POSITIONS_PER_DAY):
            result = evaluate_canary_entry(db_session, model, f"D{i}", "1d", 0.9, NOW, now=NOW)
            assert result.permitted is True
            open_canary_position(
                db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
                max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
            )
        overflow = evaluate_canary_entry(db_session, model, "EXTRA", "1d", 0.9, NOW, now=NOW)
        assert overflow.permitted is False
        assert any("today" in r.lower() for r in overflow.reasons)

    def test_a_new_day_resets_the_daily_position_counter(self, db_session):
        model, account = self._ready_account(db_session)
        result = evaluate_canary_entry(db_session, model, "DAY1", "1d", 0.9, NOW, now=NOW)
        open_canary_position(
            db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
            max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
        )
        next_day = NOW + timedelta(days=1)
        result2 = evaluate_canary_entry(db_session, model, "DAY2", "1d", 0.9, next_day, now=next_day)
        assert result2.permitted is True


class TestAutoPauseAndDailyLoss:
    def test_peak_to_trough_drawdown_triggers_auto_pause(self, db_session):
        model = _qualified_model(db_session)
        account = _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)

        # Tight stop -> large risk-sized quantity, then a severe gap-through
        # exit (real slippage a mandatory stop-loss can't fully prevent) —
        # the only way one trade's loss can plausibly reach a 2% ACCOUNT-
        # level drawdown, since per-trade risk is itself capped at 0.25%
        # under normal (non-gapped) execution.
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        position = open_canary_position(
            db_session, account, result.decision, entry_price=100.0, stop_loss=99.0,
            max_holding_days=5, take_profit=None, data_source="test", data_mode="test", now=NOW,
        )
        account.peak_equity = account.starting_balance  # equity before this trade
        close_canary_position(db_session, account, position, exit_price=90.0, exit_reason="stop_loss", now=NOW)

        assert account.auto_paused is True
        assert "drawdown" in account.auto_pause_reason.lower()

        blocked = evaluate_canary_entry(db_session, model, "NEWSYM", "1d", 0.9, NOW, now=NOW)
        assert blocked.permitted is False
        assert any("auto-paused" in r.lower() for r in blocked.reasons)

    def test_daily_loss_cap_blocks_further_entries_the_same_day(self, db_session):
        model = _qualified_model(db_session)
        account = _enable_canary(db_session)
        _engage_emergency_stop(db_session, paused=False)

        # Tight stop (risk_per_share=1) sizes a larger quantity than the
        # other tests here; closing well past the stop (a gap-through, the
        # kind of real slippage a mandatory stop-loss can't fully prevent)
        # realizes a loss bigger than one trade's own 0.25% risk budget —
        # the scenario the daily cap exists to catch.
        result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
        position = open_canary_position(
            db_session, account, result.decision, entry_price=100.0, stop_loss=99.0,
            max_holding_days=5, take_profit=None, data_source="test", data_mode="test", now=NOW,
        )
        close_canary_position(db_session, account, position, exit_price=97.0, exit_reason="stop_loss", now=NOW)
        realized_loss_pct = -position.realized_pnl_dollars / account.starting_balance * 100
        assert realized_loss_pct >= MAX_DAILY_LOSS_PCT  # sanity: this scenario really does exceed the cap

        blocked = evaluate_canary_entry(db_session, model, "NEWSYM", "1d", 0.9, NOW, now=NOW)
        assert blocked.permitted is False
        assert any("daily" in r.lower() for r in blocked.reasons)


def test_a_no_trade_decision_is_still_persisted_for_the_audit_trail(db_session):
    model = _qualified_model(db_session)
    _enable_canary(db_session)
    _engage_emergency_stop(db_session, paused=True)

    result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
    assert result.decision.id is not None
    assert result.decision.verdict == "NO_TRADE"
    assert result.decision.no_trade_reason is not None


def test_opening_twice_for_the_same_decision_never_creates_a_duplicate_position(db_session):
    model = _qualified_model(db_session)
    account = _enable_canary(db_session)
    _engage_emergency_stop(db_session, paused=False)

    result = evaluate_canary_entry(db_session, model, "AAPL", "1d", 0.9, NOW, now=NOW)
    first = open_canary_position(
        db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
        max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
    )
    # A scheduler retry / duplicate request for the SAME decision — must
    # return the original position, never open a second one.
    second = open_canary_position(
        db_session, account, result.decision, entry_price=100.0, stop_loss=95.0,
        max_holding_days=1, take_profit=None, data_source="test", data_mode="test", now=NOW,
    )
    assert second.id == first.id
    assert db_session.query(CanaryPosition).filter_by(ticker_symbol="AAPL").count() == 1
