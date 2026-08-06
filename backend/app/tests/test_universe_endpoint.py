"""GET/POST/PATCH/DELETE /api/v1/universe: reads are public, writes require
the operator role — mirrors the require_operator pattern already tested for
/models and /scan.

Seeded via POST calls through `client` itself rather than a separate
db_session fixture: with the in-memory StaticPool test DB, `client` and
`db_session` each open their own connection.begin(), and SQLite only
supports one active transaction per physical connection — combining both
fixtures in one test raises "cannot start a transaction within a
transaction". services/universe/manager.py's seed_default_universe() itself
is covered directly against db_session in test_universe_manager.py; this
file only needs a couple of representative assets per test.

`client`-driven writes are NOT rolled back between test functions (see
conftest.py's `client` fixture docstring), and this shared in-memory DB is
also what `db_session`-based tests (e.g. test_universe_manager.py) read
from within the same pytest session. So every symbol used here must be
(a) unique per test function and (b) never one of the real 20 assets in
services/universe/manager.py's SEED_UNIVERSE — otherwise a symbol added
here would collide with, or be silently skipped by, seed_default_universe()
in a test that runs later in the same session.
"""


def _add(client, symbol, asset_type="STOCK", name=None, exchange="NASDAQ"):
    res = client.post(
        "/api/v1/universe",
        json={"symbol": symbol, "asset_type": asset_type, "name": name or symbol, "exchange": exchange},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_list_universe_returns_added_assets(client):
    _add(client, "ZTSTA")
    _add(client, "ZTSTB", asset_type="ETF", exchange="ARCA")
    res = client.get("/api/v1/universe")
    assert res.status_code == 200
    symbols = {a["symbol"] for a in res.json()}
    assert {"ZTSTA", "ZTSTB"} <= symbols


def test_list_universe_filters_by_asset_type(client):
    _add(client, "ZTSTC")
    _add(client, "ZTSTD", asset_type="ETF", exchange="ARCA")
    res = client.get("/api/v1/universe?asset_type=ETF")
    body = res.json()
    assert all(a["asset_type"] == "ETF" for a in body)
    assert "ZTSTD" in {a["symbol"] for a in body}
    assert "ZTSTC" not in {a["symbol"] for a in body}


def test_list_universe_excludes_inactive_by_default(client):
    _add(client, "ZTSTE")
    client.patch("/api/v1/universe/ZTSTE", json={"is_active": False})
    res = client.get("/api/v1/universe")
    assert "ZTSTE" not in {a["symbol"] for a in res.json()}

    res_all = client.get("/api/v1/universe?include_inactive=true")
    assert "ZTSTE" in {a["symbol"] for a in res_all.json()}


def test_add_asset_succeeds_for_operator(client):
    body = _add(client, "ZTSTF", name="Ztest F Corp", exchange="NYSE")
    assert body["symbol"] == "ZTSTF"
    assert body["is_active"] is True


def test_add_asset_rejects_unknown_asset_type(client):
    res = client.post(
        "/api/v1/universe",
        json={"symbol": "ZTSTX", "asset_type": "NOT_A_TYPE", "name": "Ztest X", "exchange": "NYSE"},
    )
    assert res.status_code == 422


def test_add_duplicate_symbol_conflicts(client):
    _add(client, "ZTSTG")
    res = client.post(
        "/api/v1/universe",
        json={"symbol": "ZTSTG", "asset_type": "STOCK", "name": "Ztest G Corp", "exchange": "NASDAQ"},
    )
    assert res.status_code == 409


def test_patch_unknown_symbol_404s(client):
    res = client.patch("/api/v1/universe/NOPE", json={"is_active": False})
    assert res.status_code == 404


def test_patch_updates_fields(client):
    _add(client, "ZTSTH")
    res = client.patch("/api/v1/universe/ZTSTH", json={"tradable": False, "provider": "twelvedata"})
    assert res.status_code == 200
    body = res.json()
    assert body["tradable"] is False
    assert body["provider"] == "twelvedata"


def test_delete_removes_asset(client):
    _add(client, "ZTSTI")
    res = client.delete("/api/v1/universe/ZTSTI")
    assert res.status_code == 200
    res2 = client.get("/api/v1/universe?include_inactive=true")
    assert "ZTSTI" not in {a["symbol"] for a in res2.json()}


def test_delete_unknown_symbol_404s(client):
    res = client.delete("/api/v1/universe/NOPE")
    assert res.status_code == 404
