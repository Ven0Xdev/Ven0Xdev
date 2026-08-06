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
"""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scanner.multi_asset import run_multi_asset_prescan
from app.services.universe.manager import SEED_UNIVERSE, seed_default_universe

_SEED_SYMBOLS = {e["symbol"] for e in SEED_UNIVERSE}


def _seed_candidates(result):
    return [c for c in result.all_candidates if c.symbol in _SEED_SYMBOLS]


class _AnyAssetMockProvider(MockOTCProvider):
    """Test-only. MockOTCProvider generates realistic synthetic OHLCV/
    fundamentals/news for *any* symbol via a symbol-seeded RNG, but
    get_ticker_meta() deliberately restricts itself to its own curated
    30-ticker OTC universe (see its docstring: never fabricate a company
    for an unrecognized real-market ticker — that's the correct, audited
    behavior in production). Exercising the scanner's ranking/gating logic
    needs *some* provider willing to answer for AAPL/SPY/etc., so this
    bypasses just that one restriction and reuses the same seeded
    synthetic generation for every other field. Still fully deterministic;
    never used outside tests.
    """

    def get_ticker_meta(self, symbol):
        return self._build_meta(symbol.upper())


def test_mock_provider_correctly_refuses_symbols_outside_its_universe(db_session):
    # Real, audited behavior (not a bug): MockOTCProvider must never invent
    # a company for a real-market ticker it doesn't know. The scanner must
    # turn that refusal into a labeled "failed" candidate, never a crash.
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    result = run_multi_asset_prescan(db_session, provider)

    seed_results = _seed_candidates(result)
    assert len(seed_results) == len(_SEED_SYMBOLS)
    assert all(c.decision == "failed" for c in seed_results)
    assert all(c.reasons for c in seed_results)
    assert not any(c.symbol in _SEED_SYMBOLS for c in result.shortlist)


def test_prescan_covers_the_whole_active_universe(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()
    result = run_multi_asset_prescan(db_session, provider)

    candidate_symbols = {c.symbol for c in result.all_candidates}
    assert _SEED_SYMBOLS <= candidate_symbols
    seed_results = _seed_candidates(result)
    assert len(seed_results) == len(_SEED_SYMBOLS)
    assert all(c.decision != "failed" for c in seed_results)


def test_shortlist_never_exceeds_requested_size(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()
    result = run_multi_asset_prescan(db_session, provider, shortlist_size=3)
    assert len(result.shortlist) <= 3
    assert all(c.decision == "shortlisted" for c in result.shortlist)


def test_shortlist_is_ranked_by_overall_ai_score_descending(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()
    result = run_multi_asset_prescan(db_session, provider, shortlist_size=20)
    scores = [c.overall_ai_score for c in result.shortlist]
    assert scores == sorted(scores, reverse=True)


def test_deactivated_asset_is_excluded_from_the_prescan(db_session):
    from app.db.models.asset import Asset

    seed_default_universe(db_session)
    row = db_session.query(Asset).filter_by(symbol="TSLA").one()
    row.is_active = False
    db_session.commit()

    provider = _AnyAssetMockProvider()
    result = run_multi_asset_prescan(db_session, provider)
    assert "TSLA" not in {c.symbol for c in result.all_candidates}
    seed_results = _seed_candidates(result)
    assert len(seed_results) == len(_SEED_SYMBOLS) - 1


def test_rejected_candidates_carry_named_reasons(db_session):
    seed_default_universe(db_session)
    provider = _AnyAssetMockProvider()
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

    provider = _AnyAssetMockProvider()
    result = run_multi_asset_prescan(db_session, provider)
    assert result.universe_size == 0
    assert result.analyzed == 0
    assert result.shortlist == []
    assert result.all_candidates == []
