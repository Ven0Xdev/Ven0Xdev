"""Asset Universe Manager: seeding is idempotent and non-destructive of
operator edits, and the manager is the only place these 20 symbols live.

Counts below are scoped to the 20 seed symbols specifically (via
`_seed_query`), not a raw `Asset` table count: the in-memory test DB is
shared for the whole pytest session (StaticPool), and `client`-fixture-driven
tests elsewhere (e.g. test_universe_endpoint.py) commit their own rows that
are never rolled back — a bare `.count()` here would be fragile to however
many such rows happen to exist by the time these tests run.
"""
from app.db.models.asset import Asset
from app.services.universe.manager import SEED_UNIVERSE, get_active_universe, seed_default_universe

_SEED_SYMBOLS = {e["symbol"] for e in SEED_UNIVERSE}


def _seed_query(db_session):
    return db_session.query(Asset).filter(Asset.symbol.in_(_SEED_SYMBOLS))


def test_seed_universe_has_exactly_twenty_symbols():
    assert len(SEED_UNIVERSE) == 20
    assert len({e["symbol"] for e in SEED_UNIVERSE}) == 20  # no duplicates


def test_seed_universe_matches_spec_symbols():
    expected = {
        "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "NFLX", "AVGO",
        "SPY", "VOO", "QQQ", "DIA", "IWM", "GLD", "IAU", "SLV", "XLK", "XLE",
    }
    assert {e["symbol"] for e in SEED_UNIVERSE} == expected


def test_gld_iau_slv_are_etf_not_precious_metal():
    by_symbol = {e["symbol"]: e["asset_type"].value for e in SEED_UNIVERSE}
    assert by_symbol["GLD"] == "ETF"
    assert by_symbol["IAU"] == "ETF"
    assert by_symbol["SLV"] == "ETF"


def test_seeding_inserts_all_twenty_into_the_db(db_session):
    inserted = seed_default_universe(db_session)
    assert inserted == 20
    assert _seed_query(db_session).count() == 20


def test_seeding_twice_is_idempotent(db_session):
    seed_default_universe(db_session)
    second_run_inserted = seed_default_universe(db_session)
    assert second_run_inserted == 0
    assert _seed_query(db_session).count() == 20


def test_seeding_never_reverts_an_operator_edit(db_session):
    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="AAPL").one()
    row.is_active = False
    db_session.commit()

    seed_default_universe(db_session)  # re-seed must not touch it

    refreshed = db_session.query(Asset).filter_by(symbol="AAPL").one()
    assert refreshed.is_active is False


def test_get_active_universe_excludes_deactivated(db_session):
    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="TSLA").one()
    row.is_active = False
    db_session.commit()

    active = get_active_universe(db_session)
    active_seed_symbols = {a.symbol for a in active} & _SEED_SYMBOLS
    assert "TSLA" not in active_seed_symbols
    assert len(active_seed_symbols) == 19


def test_get_active_universe_filters_by_asset_type(db_session):
    seed_default_universe(db_session)
    stocks = get_active_universe(db_session, asset_type="STOCK")
    etfs = get_active_universe(db_session, asset_type="ETF")
    seed_stocks = {a.symbol for a in stocks} & _SEED_SYMBOLS
    seed_etfs = {a.symbol for a in etfs} & _SEED_SYMBOLS
    assert len(seed_stocks) == 10
    assert len(seed_etfs) == 10
    assert all(a.asset_type == "STOCK" for a in stocks)
    assert all(a.asset_type == "ETF" for a in etfs)
