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


def test_get_stock_analysis_for_a_real_tracked_asset_is_503_not_404(client):
    # A real, tracked asset (Asset Universe Manager) that the default mock
    # provider's own synthetic OTC-only universe simply doesn't recognize.
    # That is a *provider* limitation, not evidence the symbol doesn't
    # exist — the response must say so honestly (503, structured
    # provider_unavailable) rather than claim the symbol was "not found".
    _ensure_test_symbol_in_universe(client, "ZTRAK")
    try:
        response = client.get("/api/v1/stocks/ZTRAK/analysis")
        assert response.status_code == 503
        detail = response.json()["detail"]
        assert detail["code"] == "provider_unavailable"
        assert detail["market_data_available"] is False
    finally:
        _retire_test_symbol(client, "ZTRAK")


def test_get_stock_candles_for_a_real_tracked_asset_is_503_not_404(client):
    # A distinct symbol from the analysis test above: add_asset()'s 409
    # branch never reactivates an existing-but-deactivated row, so reusing
    # the same symbol across tests that each ensure/retire it would make
    # this test see it deactivated whenever it runs after the other one.
    _ensure_test_symbol_in_universe(client, "ZTRK2")
    try:
        response = client.get("/api/v1/stocks/ZTRK2/candles?timeframe=1D")
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "provider_unavailable"
    finally:
        _retire_test_symbol(client, "ZTRK2")


def test_watchlist_add_list_remove(client):
    add_response = client.post("/api/v1/watchlist", json={"ticker_symbol": "AXNT", "note": "watching"})
    assert add_response.status_code == 200

    list_response = client.get("/api/v1/watchlist")
    assert list_response.status_code == 200
    symbols = [item["ticker_symbol"] for item in list_response.json()]
    assert "AXNT" in symbols

    remove_response = client.delete("/api/v1/watchlist/AXNT")
    assert remove_response.status_code == 200


def _ensure_test_symbol_in_universe(client, symbol, name=None):
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
        json={"symbol": symbol, "asset_type": "STOCK", "name": name or symbol, "exchange": "NASDAQ"},
    )
    assert res.status_code in (201, 409), res.text
    if res.status_code == 409:
        # Already exists from an earlier test that later deactivated it
        # (_retire_test_symbol) — POST never reactivates (409 either way),
        # so a symbol reused across more than one test-pair would
        # otherwise stay permanently inactive from the second reuse on.
        reactivate = client.patch(f"/api/v1/universe/{symbol}", json={"is_active": True})
        assert reactivate.status_code == 200, reactivate.text


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


# ---------- ticker detection, unsupported symbols, context persistence -----

def test_chat_detects_dollar_cashtag(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        res = client.post("/api/v1/chat/message", json={"session_key": "cashtag-session", "message": "$ZCHTA to the moon?"})
        assert res.status_code == 200
        assert res.json()["ticker"] == "ZCHTA"
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_detects_bare_uppercase_symbol(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        res = client.post("/api/v1/chat/message", json={"session_key": "bare-session", "message": "What about ZCHTA?"})
        assert res.status_code == 200
        assert res.json()["ticker"] == "ZCHTA"
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_detects_natural_language_company_name(client):
    # "What about Apple?" (task's own example) works the same way as this:
    # the canonical universe's own name, minus corporate boilerplate,
    # matched as a natural phrase — never requiring the user to type the
    # ticker or the full legal name.
    _ensure_test_symbol_in_universe(client, "ZCHTB", name="Zeta Charting Inc.")
    try:
        res = client.post(
            "/api/v1/chat/message",
            json={"session_key": "company-name-session", "message": "What about Zeta Charting?"},
        )
        assert res.status_code == 200
        assert res.json()["ticker"] == "ZCHTB"
    finally:
        _retire_test_symbol(client, "ZCHTB")


def test_chat_unsupported_cashtag_symbol_is_reported_not_grounded(client):
    res = client.post(
        "/api/v1/chat/message",
        json={"session_key": "unsupported-session", "message": "$ZZZZZZ what do you think?"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ticker"] is None
    assert "ZZZZZZ" in data["reply"]
    assert "supported" in data["reply"].lower()
    # Never silently ground an unsupported mention — template mode, no
    # analysis-derived fields to fabricate.
    assert data["metadata"]["backend"] == "template"
    assert data["metadata"]["data_source"] is None


def test_chat_unsupported_symbol_does_not_clobber_prior_ticker_context(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        session_key = "unsupported-preserve-session"
        client.post("/api/v1/chat/message", json={"session_key": session_key, "message": "$ZCHTA how confident are you?"})
        # An unsupported mention must not overwrite the session's existing,
        # valid ticker context.
        unsupported = client.post(
            "/api/v1/chat/message", json={"session_key": session_key, "message": "$ZZZZZZ what about that one?"}
        )
        assert unsupported.json()["ticker"] is None

        history = client.get(f"/api/v1/chat/history/{session_key}")
        assert history.json()["ticker"] == "ZCHTA"
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_context_persists_across_turns_without_remention(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        session_key = "persist-session"
        client.post("/api/v1/chat/message", json={"session_key": session_key, "message": "$ZCHTA — should I buy?"})
        follow_up = client.post(
            "/api/v1/chat/message", json={"session_key": session_key, "message": "How confident are you?"}
        )
        assert follow_up.json()["ticker"] == "ZCHTA"
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_response_metadata_reflects_grounded_ticker(client):
    # Analysis (data_source/mode/engine/confidence) needs a symbol the
    # configured mock provider actually knows how to synthesize data for —
    # AXNT, the suite's existing legacy-OTC test symbol (used the same way
    # by test_alerts.py/test_paper_trading.py), NOT one of the real 20
    # canonical multi-asset symbols (AAPL included): those are asserted
    # exact-count elsewhere (test_universe_manager.py,
    # test_market_overview.py, ...) against the *session-scoped, never
    # rolled back* `client`-fixture DB, so deactivating one of them here
    # would leak a permanently-"19 of 20 active" state into every later
    # test in the run. AXNT has no such exact-count assertion anywhere.
    _ensure_test_symbol_in_universe(client, "AXNT")
    try:
        res = client.post("/api/v1/chat/message", json={"session_key": "metadata-session", "message": "$AXNT outlook?"})
        meta = res.json()["metadata"]
        assert meta["backend"] == "template"
        assert meta["model"] is None  # never claim template mode is an LLM
        assert isinstance(meta["safe_mode_active"], bool)
        assert meta["drift_status"] in ("insufficient_history", "stable", "moderate", "significant")
        assert meta["data_source"] is not None
        assert meta["data_mode"] is not None
        assert meta["engine_mode"] in ("HEURISTIC", "TRAINED_ML")
        assert meta["as_of"] is not None
        assert meta["confidence_score"] is not None
    finally:
        _retire_test_symbol(client, "AXNT")


def test_chat_clear_session_ticker_endpoint(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        session_key = "clear-ticker-session"
        client.post("/api/v1/chat/message", json={"session_key": session_key, "message": "$ZCHTA outlook?"})
        assert client.get(f"/api/v1/chat/history/{session_key}").json()["ticker"] == "ZCHTA"

        cleared = client.delete(f"/api/v1/chat/sessions/{session_key}/ticker")
        assert cleared.status_code == 200
        assert cleared.json()["ticker"] is None
        assert client.get(f"/api/v1/chat/history/{session_key}").json()["ticker"] is None

        # A follow-up with no ticker mention no longer silently grounds on
        # the cleared symbol.
        follow_up = client.post("/api/v1/chat/message", json={"session_key": session_key, "message": "how confident are you?"})
        assert follow_up.json()["ticker"] is None
    finally:
        _retire_test_symbol(client, "ZCHTA")


def test_chat_response_metadata_reflects_no_ticker_state(client):
    res = client.post("/api/v1/chat/message", json={"session_key": "no-ticker-session", "message": "hello there"})
    meta = res.json()["metadata"]
    assert meta["data_source"] is None
    assert meta["engine_mode"] is None
    assert meta["confidence_score"] is None
    assert "ticker" in meta["confidence_note"].lower()


def test_chat_history_carries_metadata_for_assistant_turns(client):
    _ensure_test_symbol_in_universe(client, "ZCHTA")
    try:
        session_key = "history-metadata-session"
        client.post("/api/v1/chat/message", json={"session_key": session_key, "message": "$ZCHTA outlook?"})
        history = client.get(f"/api/v1/chat/history/{session_key}").json()
        assistant_turns = [m for m in history["messages"] if m["role"] == "assistant"]
        user_turns = [m for m in history["messages"] if m["role"] == "user"]
        assert assistant_turns and assistant_turns[0]["metadata"] is not None
        assert user_turns and user_turns[0]["metadata"] is None
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
