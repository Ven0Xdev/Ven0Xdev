"""EDGAR client + enrichment tests over stubbed HTTP.

Fixtures mirror the real EDGAR JSON shapes (company_tickers.json,
companyfacts XBRL, submissions). No network, no key.
"""
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.db.models.edgar import EdgarCompanyFacts
from app.services.data_providers.base import Fundamentals, MarketDataProvider
from app.services.data_providers.edgar_client import EdgarClient
from app.services.data_providers.edgar_enricher import EdgarEnrichedProvider, refresh_edgar_facts

_NOW = datetime.now(timezone.utc)

_TICKER_MAP = {
    "0": {"cik_str": 1234567, "ticker": "REAL", "title": "Real Corp"},
    "1": {"cik_str": 7654321, "ticker": "DILU", "title": "Dilution Inc"},
}

def _facts_payload(share_points):
    return {
        "facts": {
            "dei": {
                "EntityCommonStockSharesOutstanding": {
                    "units": {"shares": [{"end": d, "val": v} for d, v in share_points]}
                }
            }
        }
    }

# DILU: 100M shares a year ago -> 190M now = +90% dilution
_DILU_FACTS = _facts_payload([
    ((_NOW - timedelta(days=400)).strftime("%Y-%m-%d"), 100_000_000),
    ((_NOW - timedelta(days=200)).strftime("%Y-%m-%d"), 150_000_000),
    ((_NOW - timedelta(days=10)).strftime("%Y-%m-%d"), 190_000_000),
])

def _submissions(days_since_periodic):
    filed = (_NOW - timedelta(days=days_since_periodic)).strftime("%Y-%m-%d")
    return {
        "filings": {
            "recent": {
                "form": ["8-K", "10-Q", "4"],
                "filingDate": [
                    (_NOW - timedelta(days=5)).strftime("%Y-%m-%d"),
                    filed,
                    (_NOW - timedelta(days=3)).strftime("%Y-%m-%d"),
                ],
            }
        }
    }


def _client(facts=_DILU_FACTS, submissions=None, days_since_periodic=30):
    submissions = submissions or _submissions(days_since_periodic)

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("company_tickers.json"):
            return httpx.Response(200, json=_TICKER_MAP)
        if "companyfacts" in path:
            return httpx.Response(200, json=facts)
        if "submissions" in path:
            return httpx.Response(200, json=submissions)
        return httpx.Response(404, json={})

    return EdgarClient(user_agent="test test@example.com", calls_per_second=10_000,
                       transport=httpx.MockTransport(handler))


def test_cik_lookup():
    client = _client()
    assert client.get_cik("dilu") == "0007654321"
    assert client.get_cik("MISSING") is None


def test_dilution_computation():
    client = _client()
    facts = client.fetch_facts("DILU")
    assert facts is not None
    assert facts.dilution_12m_pct == pytest.approx(90.0, abs=0.5)
    assert facts.shares_outstanding_latest == 190_000_000


def test_dilution_none_when_history_too_short():
    history = [(_NOW - timedelta(days=30), 100.0)]
    dilution, latest, year_ago = EdgarClient.compute_dilution_12m(history)
    assert dilution is None
    assert latest == 100.0
    assert year_ago is None


def test_filing_delinquency_heuristic():
    fresh = _client(days_since_periodic=30).fetch_facts("REAL")
    assert fresh.filing_delinquent is False

    stale = _client(days_since_periodic=200).fetch_facts("REAL")
    assert stale.filing_delinquent is True


def test_unregistered_ticker_returns_none():
    assert _client().fetch_facts("MISSING") is None


class _StubProvider(MarketDataProvider):
    name = "stub"

    def get_fundamentals(self, symbol):
        return Fundamentals(
            symbol=symbol.upper(), market_cap=1e6, float_shares=1e6,
            shares_outstanding=1e6, cash=0, total_debt=0, revenue_ttm=0,
            net_income_ttm=0,
            dilution_12m_pct=0.0,        # vendor's explicit-neutral default
            going_concern_flag=False,
            last_filing_date=None, filing_delinquent=False,
        )

    def get_universe(self, limit=None): return []
    def get_ticker_meta(self, symbol): raise NotImplementedError
    def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250): raise NotImplementedError
    def get_quote(self, symbol): raise NotImplementedError
    def get_news(self, symbol, limit=20): return []
    def get_corporate_actions(self, symbol): return []


def test_refresh_and_overlay(db_session):
    written = refresh_edgar_facts(db_session, ["DILU"], client=_client())
    assert written == 1

    row = db_session.query(EdgarCompanyFacts).filter_by(ticker_symbol="DILU").one()
    assert row.dilution_12m_pct == pytest.approx(90.0, abs=0.5)

    enriched = EdgarEnrichedProvider(_StubProvider(), lambda: db_session)
    # EdgarEnrichedProvider closes the session it opens; give it a no-close shim
    enriched._session_factory = lambda: _NoClose(db_session)

    fund = enriched.get_fundamentals("DILU")
    assert fund.dilution_12m_pct == pytest.approx(90.0, abs=0.5)      # EDGAR wins
    assert fund.shares_outstanding == 190_000_000
    assert fund.filing_delinquent is False


class _MutableIdentityProvider(_StubProvider):
    """Mimics FallbackMarketDataProvider/MixedSourceProvider: .name/.data_mode
    change after a call, exactly like a real fallback composite reporting
    which vendor actually answered."""

    def __init__(self):
        self.name = "alpaca"
        self.data_mode = "unspecified"

    def get_quote(self, symbol):
        self.name = "twelvedata_only"  # simulates a fallback having occurred
        self.data_mode = "delayed"
        return None


def test_name_and_data_mode_reflect_the_inner_providers_latest_state_not_a_construction_time_snapshot():
    # Regression: name/data_mode used to be snapshotted once in __init__ —
    # since get_data_provider() builds this wrapper once (via @lru_cache)
    # before any real call has happened, every analysis would silently
    # show the inner provider's initial default ("unspecified") forever,
    # even after real calls updated the inner provider's actual state.
    inner = _MutableIdentityProvider()
    enriched = EdgarEnrichedProvider(inner, lambda: None)

    assert enriched.name == "alpaca+edgar"
    assert enriched.data_mode == "unspecified"

    enriched.get_quote("AAPL")

    assert enriched.name == "twelvedata_only+edgar"
    assert enriched.data_mode == "delayed"


def test_overlay_leaves_vendor_values_when_edgar_unknown(db_session):
    refresh_edgar_facts(db_session, ["MISSING"], client=_client())
    row = db_session.query(EdgarCompanyFacts).filter_by(ticker_symbol="MISSING").one()
    assert row.cik == ""  # remembered as not-registered

    enriched = EdgarEnrichedProvider(_StubProvider(), lambda: _NoClose(db_session))
    fund = enriched.get_fundamentals("MISSING")
    assert fund.dilution_12m_pct == 0.0   # vendor default untouched — no fake overlay


def test_refresh_skips_fresh_rows(db_session):
    client = _client()
    assert refresh_edgar_facts(db_session, ["DILU"], client=client) == 1
    assert refresh_edgar_facts(db_session, ["DILU"], client=client) == 0  # within TTL


class _NoClose:
    def __init__(self, session):
        self._session = session

    def __getattr__(self, name):
        return getattr(self._session, name)

    def close(self):
        pass
