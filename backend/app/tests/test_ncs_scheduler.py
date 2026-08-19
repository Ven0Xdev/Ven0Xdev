"""app/workers/ncs_scheduler.py — the background worker that keeps
services/signals/ncs.py's evaluate_ncs() actually running. Without it,
chart Buy/Sell markers, the Shadow track record, and autonomous paper
trading's own trigger all stay dormant for any symbol nobody manually
evaluated (see the module's own docstring for the full explanation).
"""
from app.db.models.ncs_signal import NcsSignal
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.platform_settings import set_autonomous_trading_paused
from app.services.universe.manager import SEED_UNIVERSE, seed_default_universe
from app.workers.ncs_scheduler import run_ncs_cycle

_SEED_SYMBOLS = {e["symbol"] for e in SEED_UNIVERSE}


class _FakeOperator:
    id = 999


def test_run_ncs_cycle_persists_a_row_per_active_symbol(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()

    run_ncs_cycle(provider=provider, db=db_session, timeframes=["1D"])

    rows = db_session.query(NcsSignal).filter_by(timeframe="1D").all()
    seen = {r.ticker_symbol for r in rows}
    assert _SEED_SYMBOLS <= seen


def test_run_ncs_cycle_never_repaints_on_a_second_pass(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()

    run_ncs_cycle(provider=provider, db=db_session, timeframes=["1D"])
    first_pass_ids = {r.id for r in db_session.query(NcsSignal).all()}

    # A second cycle immediately after must be a pure no-op: the closed
    # bar hasn't changed, so every symbol's row for it already exists —
    # evaluate_ncs()'s own anti-repaint check returns the existing row
    # rather than computing/persisting a new one.
    run_ncs_cycle(provider=provider, db=db_session, timeframes=["1D"])
    second_pass_ids = {r.id for r in db_session.query(NcsSignal).all()}

    assert second_pass_ids == first_pass_ids


def test_run_ncs_cycle_skips_a_deactivated_asset(db_session):
    from app.db.models.asset import Asset

    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="TSLA").one()
    row.is_active = False
    db_session.commit()

    run_ncs_cycle(provider=MockOTCProvider(), db=db_session, timeframes=["1D"])

    assert "TSLA" not in {r.ticker_symbol for r in db_session.query(NcsSignal).all()}


def test_run_ncs_cycle_never_crashes_the_whole_pass_on_one_bad_symbol(db_session):
    from app.db.models.asset import Asset
    from app.services.data_providers.base import AssetType

    seed_default_universe(db_session)
    # A symbol MockOTCProvider's analyze_ticker path cannot serve at all
    # (get_ticker_meta refuses unrecognized real-market tickers) — must
    # degrade to "not evaluated this cycle" for that one asset, never sink
    # every other symbol in the same pass.
    db_session.add(Asset(
        symbol="ZZZZNOTREAL", asset_type=AssetType.STOCK.value, name="Not A Real Company",
        exchange="NASDAQ", currency="USD", provider="unassigned", is_active=True, tradable=True,
        supported_timeframes=["1d"],
    ))
    db_session.commit()

    run_ncs_cycle(provider=MockOTCProvider(), db=db_session, timeframes=["1D"])

    rows = db_session.query(NcsSignal).all()
    logged_symbols = {r.ticker_symbol for r in rows}
    assert "ZZZZNOTREAL" not in logged_symbols
    assert _SEED_SYMBOLS <= logged_symbols


def test_run_ncs_cycle_respects_the_platform_wide_emergency_stop(db_session):
    # Firing autonomous trades is not this worker's job — evaluate_ncs()
    # itself calls on_ncs_fired_autonomous, which must still refuse to act
    # on any fired row while the emergency stop is engaged. This is a
    # regression guard on that wiring, not a re-test of autonomous.py's
    # own gating (see test_autonomous.py for that).
    from app.db.models.paper_trading import PaperTradingAccount
    from app.services.paper_trading import engine

    set_autonomous_trading_paused(db_session, True, _FakeOperator())
    seed_default_universe(db_session)
    account = engine.start_new_simulation(user_id=1, starting_capital=100_000.0, db=db_session)
    account.autonomous_trading_enabled = True
    db_session.add(account)
    db_session.commit()

    run_ncs_cycle(provider=MockOTCProvider(), db=db_session, timeframes=["1D"])

    assert engine.list_open_positions(1, db_session) == []
    reloaded = db_session.query(PaperTradingAccount).filter_by(id=account.id).one()
    assert reloaded.cash_balance == 100_000.0


def test_critical_drift_marks_every_row_vetoed_and_blocks_every_autonomous_entry(db_session, monkeypatch):
    """End-to-end fail-closed path (item 9/11 of the NCS incident): a
    CRITICAL model_drift reading (drift_status_label == "significant",
    the same condition the Admin dashboard's "CRITICAL model_drift" alert
    fires on — see services/monitoring/service.py) must reach every symbol
    this cycle evaluates as a Red-Team veto on the persisted row, and must
    block every opted-in account from opening a new autonomous position —
    even though the platform-wide emergency stop is OFF here specifically
    to prove the drift gate itself is what's doing the blocking, not the
    unrelated emergency-stop switch."""
    from app.db.models.paper_trading import PaperTradingAccount
    from app.services.paper_trading import engine

    monkeypatch.setattr("app.services.risk.red_team.drift_status_label", lambda db: "significant")
    seed_default_universe(db_session)
    account = engine.start_new_simulation(user_id=2, starting_capital=100_000.0, db=db_session)
    account.autonomous_trading_enabled = True
    db_session.add(account)
    db_session.commit()

    # `client`-fixture-driven tests elsewhere in this shared, session-wide
    # test DB commit real (never-rolled-back) NcsSignal rows of their own
    # (see test_prediction_scheduler.py's module docstring for the same
    # discipline) — exclude anything that already existed before this
    # call so a pre-existing, non-vetoed row for one of the 20 seed
    # symbols can never masquerade as this cycle's own output.
    pre_existing_ids = {r.id for r in db_session.query(NcsSignal).filter_by(timeframe="1D").all()}

    run_ncs_cycle(provider=MockOTCProvider(), db=db_session, timeframes=["1D"])

    rows = [r for r in db_session.query(NcsSignal).filter_by(timeframe="1D").all() if r.id not in pre_existing_ids]
    assert rows
    assert all(r.vetoed for r in rows)
    assert all("drift" in (r.veto_reason or "").lower() for r in rows)
    # A vetoed row never confirms/fires (see evaluate_ncs's own contract),
    # so on_ncs_fired_autonomous is never even reached for these rows —
    # the account must show zero open positions and untouched cash.
    assert engine.list_open_positions(2, db_session) == []
    reloaded = db_session.query(PaperTradingAccount).filter_by(id=account.id).one()
    assert reloaded.cash_balance == 100_000.0
