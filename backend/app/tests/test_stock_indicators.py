"""GET /stocks/{symbol}/indicators: per-bar indicator series aligned with
/candles at the same timeframe — the data behind the chart's indicator
overlays (Phase 9)."""


def test_daily_timeframe_returns_all_default_indicators(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == symbol
    assert body["timeframe"] == "1D"
    assert len(body["timestamps"]) > 0

    expected_keys = {
        "sma_20", "sma_50", "ema_9", "ema_21", "rsi_14",
        "macd_line", "macd_signal", "macd_histogram",
        "bb_upper", "bb_middle", "bb_lower", "atr_14", "vwap",
    }
    assert set(body["series"]) == expected_keys
    for key, values in body["series"].items():
        assert len(values) == len(body["timestamps"]), key


def test_indicator_series_can_be_filtered(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&indicators=rsi,macd")
    assert res.status_code == 200
    body = res.json()
    assert set(body["series"]) == {"rsi_14", "macd_line", "macd_signal", "macd_histogram"}


def test_rsi_stays_in_bounds_where_defined(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&indicators=rsi")
    rsi_values = res.json()["series"]["rsi_14"]
    for v in rsi_values:
        if v is not None:
            assert 0 <= v <= 100


def test_early_bars_before_a_rolling_window_matures_are_null_not_fabricated(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&indicators=sma")
    sma_50 = res.json()["series"]["sma_50"]
    # A 50-period SMA cannot be defined on bar 0 — must be null, never a
    # fabricated number standing in for "not enough history yet."
    assert sma_50[0] is None


def test_unknown_indicator_is_rejected(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D&indicators=vwap,nonsense")
    assert res.status_code == 400


def test_unknown_timeframe_is_rejected(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    res = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=3d")
    assert res.status_code == 400


def test_unknown_symbol_returns_honest_error_not_fabricated_indicators(client):
    res = client.get("/api/v1/stocks/ZZZZZZ/indicators?timeframe=1D")
    assert res.status_code != 200


def test_indicators_are_aligned_with_candles_bar_count(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]
    candles = client.get(f"/api/v1/stocks/{symbol}/candles?timeframe=1D").json()
    indicators = client.get(f"/api/v1/stocks/{symbol}/indicators?timeframe=1D").json()
    assert len(indicators["timestamps"]) == candles["bar_count"]
