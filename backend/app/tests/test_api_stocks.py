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


def test_chat_message_grounds_on_ticker(client):
    response = client.post(
        "/api/v1/chat/message",
        json={"session_key": "test-session", "message": "Should I buy AXNT?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AXNT"
    assert "probability" in data["reply"].lower() or "%" in data["reply"]


def test_chat_history_persists(client):
    client.post("/api/v1/chat/message", json={"session_key": "hist-session", "message": "Tell me about AXNT"})
    response = client.get("/api/v1/chat/history/hist-session")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) >= 2


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
    response = client.get("/api/v1/scan/opportunities?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) <= 5
    if len(data) > 1:
        assert data[0]["overall_ai_score"] >= data[-1]["overall_ai_score"]
