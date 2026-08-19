"""Chart drawing persistence (app/api/v1/endpoints/chart_drawings.py) —
ownership enforcement and real {time, price} anchor round-tripping, never
screen pixels.
"""
import pytest


@pytest.fixture
def auth_on():
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


def _register(client, email: str) -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert res.status_code == 201, res.text
    return res.json()["access_token"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


TRENDLINE_DATA = {
    "p1": {"time": 1_700_000_000, "price": 10.5},
    "p2": {"time": 1_700_086_400, "price": 12.25},
    "style": {"color": "#2563eb", "width": 2, "dash": "solid"},
}


def test_create_and_list_round_trips_real_time_price_anchors_not_pixels(client, auth_on):
    token = _register(client, "drawer-a@example.com")
    headers = _auth_header(token)

    create_res = client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "aapl", "timeframe": "1D", "drawing_type": "trendline", "data": TRENDLINE_DATA},
        headers=headers,
    )
    assert create_res.status_code == 200, create_res.text
    created = create_res.json()
    assert created["ticker_symbol"] == "AAPL"
    assert created["data"]["p1"]["time"] == 1_700_000_000
    assert created["data"]["p1"]["price"] == 10.5
    assert created["locked"] is False
    assert created["hidden"] is False

    listed = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]
    assert listed[0]["data"] == TRENDLINE_DATA


def test_drawings_are_scoped_per_ticker_and_timeframe(client, auth_on):
    token = _register(client, "drawer-scope@example.com")
    headers = _auth_header(token)
    client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 100.0}},
        headers=headers,
    )
    client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1H", "drawing_type": "hline", "data": {"price": 50.0}},
        headers=headers,
    )
    client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "NVDA", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 900.0}},
        headers=headers,
    )

    aapl_1d = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=headers).json()
    aapl_1h = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1H", headers=headers).json()
    nvda_1d = client.get("/api/v1/chart-drawings?ticker=NVDA&timeframe=1D", headers=headers).json()
    assert len(aapl_1d) == 1 and aapl_1d[0]["data"]["price"] == 100.0
    assert len(aapl_1h) == 1 and aapl_1h[0]["data"]["price"] == 50.0
    assert len(nvda_1d) == 1 and nvda_1d[0]["data"]["price"] == 900.0


def test_update_can_move_lock_or_hide_a_drawing(client, auth_on):
    token = _register(client, "drawer-update@example.com")
    headers = _auth_header(token)
    created = client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 100.0}},
        headers=headers,
    ).json()

    updated = client.patch(
        f"/api/v1/chart-drawings/{created['id']}",
        json={"data": {"price": 105.5}, "locked": True},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["data"]["price"] == 105.5
    assert body["locked"] is True
    assert body["hidden"] is False  # untouched field stays as it was


def test_delete_removes_exactly_the_named_drawing(client, auth_on):
    token = _register(client, "drawer-delete@example.com")
    headers = _auth_header(token)
    keep = client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 1.0}},
        headers=headers,
    ).json()
    doomed = client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 2.0}},
        headers=headers,
    ).json()

    del_res = client.delete(f"/api/v1/chart-drawings/{doomed['id']}", headers=headers)
    assert del_res.status_code == 200

    remaining = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=headers).json()
    assert [d["id"] for d in remaining] == [keep["id"]]


def test_delete_all_clears_only_the_named_scope(client, auth_on):
    token = _register(client, "drawer-delete-all@example.com")
    headers = _auth_header(token)
    client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "hline", "data": {"price": 1.0}},
        headers=headers,
    )
    client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1H", "drawing_type": "hline", "data": {"price": 2.0}},
        headers=headers,
    )

    res = client.delete("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=headers)
    assert res.status_code == 200
    assert res.json()["deleted"] == 1

    assert client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=headers).json() == []
    assert len(client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1H", headers=headers).json()) == 1


def test_one_user_can_never_read_edit_or_delete_another_users_drawing(client, auth_on):
    token_a = _register(client, "owner-a@example.com")
    token_b = _register(client, "owner-b@example.com")
    drawing = client.post(
        "/api/v1/chart-drawings",
        json={"ticker_symbol": "AAPL", "timeframe": "1D", "drawing_type": "trendline", "data": TRENDLINE_DATA},
        headers=_auth_header(token_a),
    ).json()

    # Never appears in user B's own list for the same scope.
    b_list = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=_auth_header(token_b)).json()
    assert b_list == []

    # Cannot patch it.
    patch_res = client.patch(
        f"/api/v1/chart-drawings/{drawing['id']}", json={"locked": True}, headers=_auth_header(token_b),
    )
    assert patch_res.status_code == 404

    # Cannot delete it.
    delete_res = client.delete(f"/api/v1/chart-drawings/{drawing['id']}", headers=_auth_header(token_b))
    assert delete_res.status_code == 404

    # It's untouched from owner A's perspective.
    a_list = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D", headers=_auth_header(token_a)).json()
    assert len(a_list) == 1
    assert a_list[0]["locked"] is False


def test_drawings_require_authentication(client, auth_on):
    res = client.get("/api/v1/chart-drawings?ticker=AAPL&timeframe=1D")
    assert res.status_code == 401
