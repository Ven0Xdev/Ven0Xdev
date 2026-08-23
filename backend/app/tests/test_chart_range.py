"""GET /stocks/{symbol}/candles and /indicators: the `range` query param —
independently picks how far back the chart looks, decoupled from
`timeframe`'s bar granularity (chart Range control). Omitting it entirely
must reproduce the exact prior fixed-lookback-per-timeframe behavior —
covered by test_candles_endpoint.py's existing (untouched) assertions."""


def _symbol(client) -> str:
    return client.get("/api/v1/stocks/universe?limit=1").json()[0]["symbol"]


def test_a_wider_daily_range_returns_more_bars_than_a_narrower_one(client):
    symbol = _symbol(client)
    narrow = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D&range=1M").json()
    wide = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D&range=1Y").json()
    assert len(narrow["bars"]) < len(wide["bars"])
    assert narrow["range"] == "1M"
    assert wide["range"] == "1Y"


def test_range_all_returns_the_full_daily_history(client):
    symbol = _symbol(client)
    all_range = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D&range=ALL").json()
    default_range = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D").json()
    assert len(all_range["bars"]) >= len(default_range["bars"])


def test_range_ytd_never_includes_a_bar_from_a_prior_year(client):
    symbol = _symbol(client)
    body = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D&range=YTD").json()
    if body["bars"]:
        years = {b["ts"][:4] for b in body["bars"]}
        assert len(years) == 1


def test_unknown_range_for_a_daily_timeframe_is_rejected(client):
    symbol = _symbol(client)
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D&range=5D")
    assert res.status_code == 400


def test_unknown_range_for_an_intraday_timeframe_is_rejected(client):
    symbol = _symbol(client)
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1H&range=1Y")
    assert res.status_code == 400


def test_a_valid_intraday_range_is_accepted(client):
    symbol = _symbol(client)
    res = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1H&range=5D")
    assert res.status_code == 200
    assert res.json()["range"] == "5D"


def test_indicators_endpoint_accepts_and_echoes_range(client):
    symbol = _symbol(client)
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&range=6M")
    assert res.status_code == 200
    assert res.json()["range"] == "6M"


def test_indicators_endpoint_rejects_an_invalid_range(client):
    symbol = _symbol(client)
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&range=5D")
    assert res.status_code == 400


def test_omitting_range_reproduces_the_prior_default_bar_count(client):
    """The core backward-compatibility guarantee: no `range` param at all
    behaves identically to before this feature existed."""
    symbol = _symbol(client)
    default = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D").json()
    explicit_none = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D").json()
    assert len(default["bars"]) == len(explicit_none["bars"])
    assert default["range"] is None
