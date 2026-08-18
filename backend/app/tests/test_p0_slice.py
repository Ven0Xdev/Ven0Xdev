"""P0 vertical slice: provenance labels, ticker validation, search."""
import pytest

from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker


def test_mock_never_fabricates_unknown_symbols():
    provider = MockOTCProvider()
    with pytest.raises(ProviderDataUnavailable, match="Unknown symbol"):
        provider.get_ticker_meta("ZZZZZZ")


def test_analysis_of_unknown_symbol_fails_cleanly():
    provider = MockOTCProvider()
    with pytest.raises(ProviderDataUnavailable, match="Unknown symbol"):
        analyze_ticker("NOTREAL", provider=provider)


def test_analysis_carries_provenance():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)
    assert analysis.data_source == "mock"
    assert analysis.data_mode == "synthetic"      # demo data is labeled, never silent
    assert analysis.as_of is not None
    assert analysis.price_as_of is not None


def test_unknown_symbol_analysis_404(client):
    response = client.get("/api/v1/stocks/ZZZZZZ/analysis")
    assert response.status_code == 404


def test_search_finds_universe_symbols(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    body = client.get(f"/api/v1/stocks/search?q={symbol[:3]}").json()
    assert body["valid_format"] is True
    assert body["data_mode"] == "synthetic"
    assert any(m["symbol"] == symbol for m in body["matches"])
    assert body["as_of"]


def test_search_unknown_symbol_returns_empty_not_fabricated(client):
    body = client.get("/api/v1/stocks/search?q=ZZZZZZ").json()
    assert body["valid_format"] is True
    assert body["matches"] == []


def test_search_rejects_invalid_format(client):
    body = client.get("/api/v1/stocks/search?q=DROP TABLE;").json()
    assert body["valid_format"] is False
    assert body["matches"] == []


def test_chat_footer_cites_source_and_timestamp():
    from app.services.chat.assistant import generate_reply

    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    reply, _, _ = generate_reply(f"Should I buy {symbol}?", None, [])
    assert "'mock'" in reply and "synthetic" in reply
    assert "UTC" in reply
