"""GET /api/v1/scan/multi-asset/prescan: wiring, auth, and response shape
only. Universe-wide scanning behavior (ranking, gating, exclusions) is
covered directly against services.scanner.multi_asset via db_session in
test_multi_asset_scanner.py.

Seeded with client-added test-only symbols, never the real 20 seed
symbols — see test_universe_endpoint.py's module docstring for why:
`client`-driven writes are never rolled back within a pytest session, and
test_universe_manager.py's tests assert exact seed-symbol counts elsewhere
in this same shared in-memory test DB.
"""


def _add(client, symbol, asset_type="STOCK"):
    res = client.post(
        "/api/v1/universe",
        json={"symbol": symbol, "asset_type": asset_type, "name": symbol, "exchange": "NASDAQ"},
    )
    assert res.status_code == 201, res.text


def test_prescan_endpoint_includes_a_freshly_added_test_asset(client):
    _add(client, "ZSCANA")
    res = client.get("/api/v1/scan/multi-asset/prescan")
    assert res.status_code == 200
    body = res.json()
    assert {"universe_size", "analyzed", "shortlist", "candidates"} <= body.keys()
    assert "ZSCANA" in {c["symbol"] for c in body["candidates"]}


def test_prescan_shortlist_size_is_respected(client):
    for sym in ("ZSCANB", "ZSCANC", "ZSCAND"):
        _add(client, sym)
    res = client.get("/api/v1/scan/multi-asset/prescan?shortlist_size=1")
    assert res.status_code == 200
    assert len(res.json()["shortlist"]) <= 1


def test_prescan_candidate_has_decision_and_reasons_fields(client):
    _add(client, "ZSCANE")
    res = client.get("/api/v1/scan/multi-asset/prescan")
    body = res.json()
    candidate = next(c for c in body["candidates"] if c["symbol"] == "ZSCANE")
    assert candidate["decision"] in ("shortlisted", "passed", "rejected", "failed")
    assert isinstance(candidate["reasons"], list)
