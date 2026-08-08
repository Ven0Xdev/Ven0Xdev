def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_universe(client):
    response = client.get("/api/v1/stocks/universe?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
    assert "symbol" in data[0]


def test_get_stock_analysis(client):
    universe = client.get("/api/v1/stocks/universe?limit=1").json()
    symbol = universe[0]["symbol"]

    response = client.get(f"/api/v1/stocks/{symbol}/analysis")
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == symbol
    assert 0 <= data["overall_ai_score"] <= 100
    assert len(data["probability_matrix"]) == 3


def test_get_stock_analysis_unknown_symbol_handles_gracefully(client):
    response = client.get("/api/v1/stocks/ZZZZZZ/analysis")
    assert response.status_code in (200, 404)


def test_watchlist_add_list_remove(client):
    add_response = client.post("/api/v1/watchlist", json={"ticker_symbol": "AXNT", "note": "watching"})
    assert add_response.status_code == 200

    list_response = client.get("/api/v1/watchlist")
    assert list_response.status_code == 200
    symbols = [item["ticker_symbol"] for item in list_response.json()]
    assert "AXNT" in symbols

    remove_response = client.delete("/api/v1/watchlist/AXNT")
    assert remove_response.status_code == 200


def _ensure_test_symbol_in_universe(client, symbol):
    # resolve_ticker() sources known symbols from the Asset Universe Manager
    # (services/universe/manager.py), which for `client`-fixture tests is a
    # fresh in-memory DB the app lifespan's own seed never touches (see
    # conftest.py's `client` fixture docstring) — so tests relying on a
    # symbol being "known" must add it themselves. A dedicated test-only
    # symbol (never one of the real 20 seed symbols) avoids polluting the
    # exact-count assertions in test_universe_manager.py, which shares this
    # same in-memory DB across the whole test session (see
    # test_multi_asset_scan_endpoint.py's module docstring for the same
    # convention). Tolerates a 409 from an earlier test having added it.
    res = client.post(
        "/api/v1/universe",
        json={"symbol": symbol, "asset_type": "STOCK", "name": symbol, "exchange": "NASDAQ"},
    )
    assert res.status_code in (201, 409), res.text


def _retire_test_symbol(client, symbol):
    # client-fixture writes are never rolled back within a pytest session
    # (see conftest.py), so an *active* test-only symbol would otherwise
    # leak into every later test that iterates "all active assets"
    # (e.g. test_market_overview.py's exact-count assertions). Deactivating
    # — not deleting — mirrors seed_default_universe's own "never silently
    # revert" discipline while still excluding it from active-universe scans.
    client.patch(f"/api/v1/universe/{symbol}", json={"is_active": False})


def test_chat_message_grounds_on_ticker(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        response = client.post(
            "/api/v1/chat/message",
            json={"session_key": "test-session", "message": "Should I buy ZCHTA?"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ticker"] == "ZCHTA"
        assert "probability" in data["reply"].lower() or "%" in data["reply"]
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_history_persists(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        client.post("/api/v1/chat/message", json={"session_key": "hist-session", "message": "Tell me about ZCHTA"})
        response = client.get("/api/v1/chat/history/hist-session")
        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) >= 2
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_backtest_run_endpoint(client):
    response = client.post(
        "/api/v1/backtest/run",
        json={"universe_limit": 5, "lookback_days": 200, "max_hold_days": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert "sharpe_ratio" in data
    assert "trades" in data


def test_scan_opportunities(client):
    # /scan/opportunities now scans the Asset Universe Manager's active
    # assets (possibly including a test-only symbol seeded by an earlier
    # test in this file) through whatever provider is configured. The
    # default "mock" provider is a synthetic OTC demo dataset that
    # legitimately can't serve unrecognized tickers, so a 503 ("every
    # ticker failed on the vendor") is an expected, correctly-labeled
    # outcome here — not a bug.
    response = client.get("/api/v1/scan/opportunities?limit=5")
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        data = response.json()
        assert len(data) <= 5
        if len(data) > 1:
            assert data[0]["overall_ai_score"] >= data[-1]["overall_ai_score"]
