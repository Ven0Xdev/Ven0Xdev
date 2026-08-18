"""GET /stocks/{symbol}/candles: timeframe-aware candle fetching, the data
source behind the chart's timeframe selector."""
import pytest


def test_daily_timeframe_returns_real_bars(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == symbol
    assert body["timeframe"] == "1D"
    assert len(body["bars"]) > 0
    assert body["data_mode"] == "synthetic"  # mock provider, honestly labeled
    for key in ("open", "high", "low", "close", "volume"):
        assert key in body["bars"][0]


def test_weekly_timeframe_resamples_fewer_bars_than_daily(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    daily = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D").json()
    weekly = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1W").json()
    assert len(weekly["bars"]) < len(daily["bars"])


def test_unknown_timeframe_is_rejected(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=3d")
    assert res.status_code == 400


def test_intraday_timeframe_starts_the_stream_and_returns_honest_note(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1m")
    assert res.status_code == 200
    body = res.json()
    assert body["timeframe"] == "1m"
    # Freshly (re)started stream with no REST intraday backfill available
    # (the mock provider under test) — sparse/no history yet, honestly
    # noted rather than silently claiming a full chart's worth of data.
    if body["bar_count"] < 30:
        assert body["note"] is not None
        assert "intraday bars available" in body["note"]


def test_unknown_symbol_returns_honest_error_not_fabricated_candles(client):
    res = client.get("/api/v1/stocks/ZZZZZZ/candles?timeframe=1D")
    assert res.status_code != 200
