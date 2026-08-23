"""app/workers/prediction_scheduler.py — the mainstream (non-OTC) periodic
prediction logger. Without this worker, `workers/scan_scheduler.py` (OTC-only,
disabled by default) was the *only* code path that ever wrote a Prediction
row, meaning the calibration report and Phase 8's Champion/Challenger gate
would have nothing to measure in a real deployment.

Assertions below are scoped to the 20 real seed symbols specifically, never
to raw `logged`/active-universe totals: the in-memory test DB is shared for
the whole pytest session, and client-fixture-driven test files commit their
own test-only assets that are never rolled back — see
test_multi_asset_scanner.py's module docstring for the same discipline
applied there.
"""
from app.db.models.alert import AlertEvent, AlertRule
from app.db.models.prediction import Prediction
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker
from app.services.universe.manager import SEED_UNIVERSE, get_active_universe, seed_default_universe
from app.workers.prediction_scheduler import run_prediction_cycle

_SEED_SYMBOLS = {e["symbol"] for e in SEED_UNIVERSE}


class _AnyAssetMockProvider(MockOTCProvider):
    """Test-only, same technique as test_multi_asset_scanner.py's helper of
    the same name: MockOTCProvider's get_ticker_meta() deliberately refuses
    real-market tickers it doesn't carry (audited, correct production
    behavior) — this bypasses just that restriction so the worker's own
    logic (not the provider's) is what's under test.
    """

    def get_ticker_meta(self, symbol):
        return self._build_meta(symbol.upper())


def test_run_prediction_cycle_logs_one_prediction_per_active_asset(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()

    logged = run_prediction_cycle(provider=provider, db=db_session)

    assert logged >= len(_SEED_SYMBOLS)
    rows = db_session.query(Prediction).all()
    seed_rows = {r.ticker_symbol for r in rows if r.ticker_symbol in _SEED_SYMBOLS}
    assert seed_rows == _SEED_SYMBOLS


def test_run_prediction_cycle_logs_honest_provenance(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()

    run_prediction_cycle(provider=provider, db=db_session)

    rows = db_session.query(Prediction).all()
    assert rows
    # No trained artifact exists in this repo — every logged prediction is
    # honestly HEURISTIC, never silently upgraded.
    assert all(r.engine_mode == "HEURISTIC" for r in rows)
    assert all(r.risk_policy_version for r in rows)


def test_run_prediction_cycle_skips_deactivated_assets(db_session):
    from app.db.models.asset import Asset

    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="TSLA").one()
    row.is_active = False
    db_session.commit()

    provider = _AnyAssetMockProvider()
    run_prediction_cycle(provider=provider, db=db_session)

    rows = db_session.query(Prediction).all()
    assert "TSLA" not in {r.ticker_symbol for r in rows}


def test_run_prediction_cycle_never_crashes_on_one_bad_symbol(db_session):
    # The real (unmodified) MockOTCProvider now recognizes every one of the
    # 20 canonical seed symbols directly (see mock_provider.py's
    # _MULTI_ASSET_PROFILES) — a genuinely unrecognized symbol must still
    # degrade that one asset to "not logged," never raise or sink the cycle.
    from app.db.models.asset import Asset
    from app.services.data_providers.base import AssetType

    seed_default_universe(db_session)
    db_session.add(Asset(
        symbol="ZZZZNOTREAL", asset_type=AssetType.STOCK.value, name="Not A Real Company",
        exchange="NASDAQ", currency="USD", provider="unassigned", is_active=True, tradable=True,
        supported_timeframes=["1d"],
    ))
    db_session.commit()

    # Determined at call time, not hardcoded to the full 20: an earlier test
    # in this file (test_run_prediction_cycle_skips_deactivated_assets)
    # deactivates TSLA in this same shared session-wide DB.
    active_seed_symbols = {a.symbol for a in get_active_universe(db_session)} & _SEED_SYMBOLS

    logged = run_prediction_cycle(provider=MockOTCProvider(), db=db_session)

    assert logged >= len(active_seed_symbols)
    rows = db_session.query(Prediction).all()
    logged_symbols = {r.ticker_symbol for r in rows}
    assert "ZZZZNOTREAL" not in logged_symbols
    assert active_seed_symbols <= logged_symbols


def test_run_prediction_cycle_also_evaluates_alert_rules(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()
    symbol = "AAPL"
    real_price = analyze_ticker(symbol, provider=provider).current_price

    db_session.add(AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="above", threshold_value=real_price - 0.01,
    ))
    db_session.commit()

    run_prediction_cycle(provider=provider, db=db_session)

    events = db_session.query(AlertEvent).filter_by(ticker_symbol=symbol).all()
    assert len(events) == 1
    assert events[0].observed_value == real_price
