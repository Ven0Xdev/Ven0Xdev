"""Shadow observation — passive hypothetical tracking of fired NCS
signals. Never the paper trading engine (see services/shadow/engine.py's
module docstring)."""
from datetime import timedelta

import pandas as pd
import pytest

from app.db.models.ncs_signal import NcsSignal
from app.db.models.shadow_position import ShadowPosition
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.shadow.engine import (
    MAX_HOLDING_BARS,
    SHADOW_VERSION,
    mark_and_maybe_close,
    on_ncs_evaluated,
    on_ncs_fired,
    shadow_stats,
    sweep_open_positions,
    sweep_position,
)
from app.services.signals.ncs import NCS_VERSION, evaluate_ncs

SYMBOL = "AAPL"
BASE_TS = pd.Timestamp("2026-08-01T00:00:00Z").to_pydatetime()


def _ncs_row(db, bar_ts=BASE_TS, confirmed_verdict="BUY", fired=True, **overrides):
    defaults = dict(
        ticker_symbol=SYMBOL, timeframe="1D", bar_ts=bar_ts,
        raw_verdict=confirmed_verdict or "NEUTRAL", confirmed_verdict=confirmed_verdict, fired=fired,
        composite_score=0.5, confidence_pct=70.0, risk_score=25.0, explanation="test",
        components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    defaults.update(overrides)
    row = NcsSignal(**defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _open_position(db, direction="LONG", entry_price=100.0, entry_bar_ts=BASE_TS, ncs_row=None):
    if ncs_row is None:
        ncs_row = _ncs_row(db, bar_ts=entry_bar_ts)
    position = ShadowPosition(
        ncs_signal_id=ncs_row.id, ticker_symbol=SYMBOL, timeframe="1D", direction=direction,
        entry_bar_ts=entry_bar_ts, entry_price=entry_price, status="OPEN", version=SHADOW_VERSION,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


# ---------- on_ncs_fired ------------------------------------------------


def test_opens_a_long_position_for_a_buy_family_fired_row(db_session):
    row = _ncs_row(db_session, confirmed_verdict="STRONG_BUY")
    position = on_ncs_fired(db_session, row, entry_price=150.0)
    assert position is not None
    assert position.direction == "LONG"
    assert position.entry_price == 150.0
    assert position.entry_bar_ts == row.bar_ts
    assert position.status == "OPEN"


def test_opens_a_short_position_for_a_sell_family_fired_row(db_session):
    row = _ncs_row(db_session, confirmed_verdict="SELL")
    position = on_ncs_fired(db_session, row, entry_price=90.0)
    assert position is not None
    assert position.direction == "SHORT"


def test_never_opens_a_position_for_a_neutral_bucket(db_session):
    row = _ncs_row(db_session, confirmed_verdict="NEUTRAL")
    assert on_ncs_fired(db_session, row, entry_price=100.0) is None


def test_is_idempotent_for_the_same_ncs_row(db_session):
    row = _ncs_row(db_session, confirmed_verdict="BUY")
    first = on_ncs_fired(db_session, row, entry_price=100.0)
    second = on_ncs_fired(db_session, row, entry_price=999.0)  # different price — must still return the same row
    assert first.id == second.id
    assert second.entry_price == 100.0
    assert db_session.query(ShadowPosition).filter_by(ncs_signal_id=row.id).count() == 1


# ---------- mark_and_maybe_close ----------------------------------------


def test_marking_a_later_bar_updates_mfe_and_mae_for_a_long(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)
    mark_and_maybe_close(db_session, position, BASE_TS + timedelta(days=1), 105.0, None)
    assert position.mfe_pct == pytest.approx(0.05)
    assert position.mae_pct == pytest.approx(0.0)
    assert position.holding_bars_elapsed == 1
    assert position.status == "OPEN"

    mark_and_maybe_close(db_session, position, BASE_TS + timedelta(days=2), 95.0, None)
    assert position.mfe_pct == pytest.approx(0.05)  # best-so-far, not overwritten by a worse bar
    assert position.mae_pct == pytest.approx(-0.05)
    assert position.holding_bars_elapsed == 2


def test_marking_a_later_bar_updates_mfe_and_mae_for_a_short(db_session):
    position = _open_position(db_session, direction="SHORT", entry_price=100.0)
    mark_and_maybe_close(db_session, position, BASE_TS + timedelta(days=1), 90.0, None)  # price down = favorable to a short
    assert position.mfe_pct == pytest.approx(0.10)
    assert position.mae_pct == pytest.approx(0.0)


def test_never_marks_a_bar_at_or_before_entry(db_session):
    position = _open_position(db_session, entry_price=100.0, entry_bar_ts=BASE_TS)
    mark_and_maybe_close(db_session, position, BASE_TS, 200.0, None)  # same bar as entry
    assert position.holding_bars_elapsed == 0
    mark_and_maybe_close(db_session, position, BASE_TS - timedelta(days=1), 200.0, None)  # earlier bar
    assert position.holding_bars_elapsed == 0


def test_never_marks_an_already_closed_position(db_session):
    position = _open_position(db_session, entry_price=100.0)
    position.status = "CLOSED"
    position.pnl_pct = 0.5
    db_session.commit()
    mark_and_maybe_close(db_session, position, BASE_TS + timedelta(days=1), 999.0, None)
    assert position.pnl_pct == 0.5  # untouched


def test_closes_on_max_holding_period(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)
    for i in range(1, MAX_HOLDING_BARS + 1):
        mark_and_maybe_close(db_session, position, BASE_TS + timedelta(days=i), 100.0 + i, None)
    assert position.status == "CLOSED"
    assert position.exit_reason == "max_holding_period"
    assert position.holding_bars_elapsed == MAX_HOLDING_BARS
    assert position.pnl_pct == pytest.approx((100.0 + MAX_HOLDING_BARS - 100.0) / 100.0)


def test_closes_early_on_an_opposite_fired_ncs_reversal(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)
    reversal_ts = BASE_TS + timedelta(days=3)
    reversal_row = _ncs_row(db_session, bar_ts=reversal_ts, confirmed_verdict="SELL", fired=True)

    mark_and_maybe_close(db_session, position, reversal_ts, 102.0, reversal_row)
    assert position.status == "CLOSED"
    assert position.exit_reason == "ncs_reversal"
    assert position.holding_bars_elapsed == 1  # well under the max — closed early


def test_a_fired_row_in_the_same_direction_never_counts_as_a_reversal(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)
    same_dir_ts = BASE_TS + timedelta(days=1)
    same_dir_row = _ncs_row(db_session, bar_ts=same_dir_ts, confirmed_verdict="STRONG_BUY", fired=True)

    mark_and_maybe_close(db_session, position, same_dir_ts, 101.0, same_dir_row)
    assert position.status == "OPEN"


# ---------- on_ncs_evaluated (opportunistic per-evaluation marking) -----


def test_on_ncs_evaluated_marks_other_open_positions_on_the_same_ticker_and_timeframe(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0, entry_bar_ts=BASE_TS)
    later_row = _ncs_row(db_session, bar_ts=BASE_TS + timedelta(days=1), confirmed_verdict="BUY", fired=False)

    on_ncs_evaluated(db_session, later_row, close_price=110.0)
    db_session.refresh(position)
    assert position.holding_bars_elapsed == 1
    assert position.mfe_pct == pytest.approx(0.10)


def test_on_ncs_evaluated_does_not_touch_a_different_timeframes_positions(db_session):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)
    other_tf_row = _ncs_row(db_session, bar_ts=BASE_TS + timedelta(hours=1), confirmed_verdict="BUY", fired=False, timeframe="1H")

    on_ncs_evaluated(db_session, other_tf_row, close_price=500.0)
    db_session.refresh(position)
    assert position.holding_bars_elapsed == 0


# ---------- sweep_position / sweep_open_positions ------------------------


def test_sweep_position_walks_every_real_closed_bar_since_entry(db_session):
    provider = MockOTCProvider()
    from app.services.signals.engine import bars_for_timeframe

    df = bars_for_timeframe(SYMBOL, provider, "1D", closed_only=True)
    assert len(df) >= 5
    entry_ts = df.index[-5].to_pydatetime()
    if entry_ts.tzinfo is None:
        from datetime import timezone

        entry_ts = entry_ts.replace(tzinfo=timezone.utc)
    entry_price = float(df["close"].iloc[-5])

    ncs_row = _ncs_row(db_session, bar_ts=entry_ts, confirmed_verdict="BUY")
    position = _open_position(db_session, direction="LONG", entry_price=entry_price, entry_bar_ts=entry_ts, ncs_row=ncs_row)

    sweep_position(db_session, position, provider)
    assert position.holding_bars_elapsed == 4  # 4 real bars after entry in this 5-bar slice


def test_sweep_open_positions_skips_a_ticker_the_provider_cannot_serve(db_session, monkeypatch):
    position = _open_position(db_session, direction="LONG", entry_price=100.0)

    class _BrokenProvider(MockOTCProvider):
        def get_ohlcv(self, symbol, lookback_days=2000):
            raise ProviderDataUnavailable("no data")

    swept = sweep_open_positions(db_session, _BrokenProvider())
    assert swept == 0  # the one open position's ticker failed, never crashed the sweep


# ---------- shadow_stats --------------------------------------------------


def test_stats_are_honestly_none_with_no_closed_sample_yet(db_session):
    _open_position(db_session)
    s = shadow_stats(db_session, ticker=SYMBOL)
    assert s.count_open == 1
    assert s.count_closed == 0
    assert s.win_rate_pct is None
    assert s.avg_pnl_pct is None


def test_stats_compute_win_rate_and_averages_over_closed_positions(db_session):
    win = _open_position(db_session, direction="LONG", entry_price=100.0)
    win.status = "CLOSED"
    win.pnl_pct = 0.10
    win.mfe_pct = 0.12
    win.mae_pct = -0.01
    loss = _open_position(db_session, direction="LONG", entry_price=100.0, entry_bar_ts=BASE_TS + timedelta(days=1))
    loss.status = "CLOSED"
    loss.pnl_pct = -0.04
    loss.mfe_pct = 0.01
    loss.mae_pct = -0.05
    db_session.commit()

    s = shadow_stats(db_session, ticker=SYMBOL)
    assert s.count_closed == 2
    assert s.win_rate_pct == pytest.approx(50.0)
    assert s.avg_pnl_pct == pytest.approx(0.03)


# ---------- end-to-end: evaluate_ncs firing opens a real shadow position -


def test_evaluate_ncs_firing_opens_a_real_shadow_position(db_session):
    from app.services.signals.ncs import _bucket, compute_ncs

    # A different symbol than test_ncs.py's AAPL/1D — those tests hit the
    # `client` fixture (no rollback, by design, per that fixture's own
    # docstring), which leaves a permanently committed NcsSignal row for
    # (AAPL, 1D, today's bar) in this shared StaticPool-backed in-memory
    # DB for the rest of the pytest session. evaluate_ncs's anti-repaint
    # check would find that pre-existing row before ever reaching this
    # test's own seeded-prior-row confirmation flow, returning the wrong
    # (unconfirmed) row. A distinct symbol sidesteps the collision
    # entirely, matching the same discipline test_news_api.py's own
    # docstring already documents for this StaticPool sharing behavior.
    symbol = "NVDA"
    provider = MockOTCProvider()
    c = compute_ncs(symbol, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket == "NEUTRAL":
        return  # nothing to fire — matches test_ncs.py's own convention

    prior = NcsSignal(
        ticker_symbol=symbol, timeframe="1D", bar_ts=c.bar_ts - timedelta(days=1),
        raw_verdict=c.raw_verdict, confirmed_verdict=None, fired=False,
        composite_score=0.3, confidence_pct=60.0, risk_score=20.0, explanation="seed",
        components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    db_session.add(prior)
    db_session.commit()

    row = evaluate_ncs(symbol, provider, db_session, timeframe="1D", cooldown_minutes=60)
    assert row.fired is True

    position = db_session.query(ShadowPosition).filter_by(ncs_signal_id=row.id).one_or_none()
    assert position is not None
    assert position.entry_price == c.close_price
    assert position.direction == ("LONG" if bucket == "BUY" else "SHORT")
