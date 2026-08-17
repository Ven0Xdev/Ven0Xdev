"""Two-stage multi-asset scanner: pre-scans the Asset Universe Manager's
active universe (not the OTC provider universe), applies quality gates +
the deterministic risk engine, and ranks survivors into a shortlist.

Assertions below are scoped to the 20 real seed symbols specifically
(`_seed_candidates`), never to raw `universe_size`/`analyzed` totals: the
in-memory test DB is shared for the whole pytest session, and other
client-fixture-driven test files (test_universe_endpoint.py,
test_multi_asset_scan_endpoint.py) commit their own test-only assets that
are never rolled back — see test_universe_manager.py's module docstring
for the same discipline applied there.

Regression coverage for the Opportunities-scan bug (`Unknown symbol 'XLK'
— not in the synthetic universe`): MockOTCProvider previously only
recognized its own 30-ticker OTC universe, so every symbol in the
canonical multi-asset universe failed the same way, not just XLK — see
mock_provider.py's `_MULTI_ASSET_PROFILES` module docstring for the fix.
"""
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scanner.multi_asset import run_multi_asset_prescan
from app.services.universe.manager import SEED_UNIVERSE, seed_default_universe

_SEED_SYMBOLS = {e["symbol"] for e in SEED_UNIVERSE}


def _seed_candidates(result):
    return [c for c in result.all_candidates if c.symbol in _SEED_SYMBOLS]


def test_mock_provider_recognizes_every_canonical_symbol():
    # Every stock and ETF in the canonical multi-asset universe must
    # resolve — not just XLK, the one that happened to surface in the
    # browser. A real vendor (Polygon/Finnhub/etc.) knows both AAPL and
    # OTC micro-caps; the synthetic provider must too.
    provider = MockOTCProvider()
    assert _SEED_SYMBOLS, "canonical universe must not be empty"
    for symbol in sorted(_SEED_SYMBOLS):
        meta = provider.get_ticker_meta(symbol)
        assert meta.symbol == symbol
        assert meta.market_cap > 0
        assert meta.reverse_split_count_3y == 0

        fundamentals = provider.get_fundamentals(symbol)
        assert fundamentals.symbol == symbol
        assert fundamentals.going_concern_flag is False
        assert fundamentals.filing_delinquent is False

        df = provider.get_ohlcv(symbol, lookback_days=60)
        assert len(df) >= 40
        assert (df["close"] > 0).all()
        assert (df["bid"] <= df["ask"]).all()

        news = provider.get_news(symbol)
        assert all(n.symbol == symbol for n in news)

        # get_corporate_actions() reads meta.reverse_split_count_3y (0 for
        # every canonical symbol) — must not raise for a recognized symbol.
        assert provider.get_corporate_actions(symbol) == []


def test_mock_provider_still_refuses_truly_unknown_symbols():
    # The "never fabricate a company" rule must survive synchronizing the
    # canonical universe in: a symbol outside *both* known sets (OTC
    # universe and canonical multi-asset universe) still fails exactly as
    # before.
    provider = MockOTCProvider()
    try:
        provider.get_ticker_meta("ZZZZNOTREAL")
    except ProviderDataUnavailable as exc:
        assert "ZZZZNOTREAL" in str(exc)
    else:
        raise AssertionError("expected ProviderDataUnavailable for an unrecognized symbol")


def test_mock_provider_get_universe_is_unaffected_by_the_multi_asset_sync():
    # get_universe() backs the legacy OTC-only scanner (`/scan/run-cycle`)
    # and must keep returning exactly its own 30-ticker OTC set — the
    # canonical multi-asset symbols are looked up by get_ticker_meta()
    # directly, never mixed into this list.
    provider = MockOTCProvider()
    universe_symbols = {t.symbol for t in provider.get_universe()}
    assert len(universe_symbols) == 30
    assert universe_symbols.isdisjoint(_SEED_SYMBOLS)


def test_prescan_covers_the_whole_active_universe(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider)

    candidate_symbols = {c.symbol for c in result.all_candidates}
    assert _SEED_SYMBOLS <= candidate_symbols
    seed_results = _seed_candidates(result)
    assert len(seed_results) == len(_SEED_SYMBOLS)
    assert all(c.decision != "failed" for c in seed_results)


def test_shortlist_never_exceeds_requested_size(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider, shortlist_size=3)
    assert len(result.shortlist) <= 3
    assert all(c.decision == "shortlisted" for c in result.shortlist)


def test_shortlist_is_ranked_by_overall_ai_score_descending(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider, shortlist_size=20)
    scores = [c.overall_ai_score for c in result.shortlist]
    assert scores == sorted(scores, reverse=True)


def test_deactivated_asset_is_excluded_from_the_prescan(db_session):
    from app.db.models.asset import Asset

    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="TSLA").one()
    row.is_active = False
    db_session.commit()

    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider)
    assert "TSLA" not in {c.symbol for c in result.all_candidates}
    seed_results = _seed_candidates(result)
    assert len(seed_results) == len(_SEED_SYMBOLS) - 1


def test_rejected_candidates_carry_named_reasons(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider)
    for c in result.all_candidates:
        if c.decision == "rejected":
            assert c.reasons, f"{c.symbol} was rejected with no reasons recorded"
        if c.decision in ("shortlisted", "passed"):
            assert c.reasons == []


def test_no_active_assets_returns_empty_result_not_an_error(db_session):
    from app.db.models.asset import Asset

    # Deactivate whatever is currently active in this shared test DB (not
    # just the seed symbols — other test files' client-committed rows
    # persist for the whole pytest session too) so get_active_universe()
    # is genuinely empty, and confirm the scanner handles that gracefully
    # rather than assuming the table starts empty.
    for row in db_session.query(Asset).filter_by(is_active=True).all():
        row.is_active = False
    db_session.commit()

    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider)
    assert result.universe_size == 0
    assert result.analyzed == 0
    assert result.shortlist == []
    assert result.all_candidates == []
