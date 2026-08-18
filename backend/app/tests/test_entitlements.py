"""Plan-based usage limits — Phase 13. Watchlist and alert-rule creation
are enforced against a fresh, isolated registered user (not the shared
dev/test principal — a real quota test needs to control the starting
count exactly, which the shared dev principal's cross-test-file state
cannot guarantee).
"""
import pytest

from app.core.config import get_settings
from app.core.entitlements import PLAN_LIMITS, EntitlementExceeded, enforce_limit, limit_for


@pytest.fixture
def auth_on():
    """Flip AUTH_REQUIRED for a test and restore afterwards — same fixture
    as test_auth.py's, redefined locally since pytest fixtures defined
    inside a test module aren't visible from other modules."""
    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


def test_limit_for_falls_back_to_free_for_an_unknown_plan():
    assert limit_for("nonexistent-plan", "max_watchlist_items") == PLAN_LIMITS["free"]["max_watchlist_items"]


def test_enforce_limit_passes_below_the_cap():
    enforce_limit("free", "max_watchlist_items", PLAN_LIMITS["free"]["max_watchlist_items"] - 1, "watchlist items")


def test_enforce_limit_raises_at_the_cap():
    limit = PLAN_LIMITS["free"]["max_watchlist_items"]
    try:
        enforce_limit("free", "max_watchlist_items", limit, "watchlist items")
        pytest.fail("expected EntitlementExceeded")
    except EntitlementExceeded as exc:
        assert "free plan" in str(exc)
        assert "upgrade" in str(exc).lower()


def test_pro_plan_has_a_higher_limit_than_free():
    assert PLAN_LIMITS["pro"]["max_watchlist_items"] > PLAN_LIMITS["free"]["max_watchlist_items"]
    assert PLAN_LIMITS["pro"]["max_alert_rules"] > PLAN_LIMITS["free"]["max_alert_rules"]


# --- API-level: watchlist quota ----------------------------------------


def _register(client, email, password="correct-horse-battery"):
    return client.post("/api/v1/auth/register", json={"email": email, "password": password})


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_watchlist_add_is_refused_once_the_free_plan_limit_is_reached(client, auth_on):
    token = _register(client, "watchlist-quota@example.com").json()["access_token"]
    headers = _auth_header(token)
    limit = PLAN_LIMITS["free"]["max_watchlist_items"]

    for i in range(limit):
        res = client.post("/api/v1/watchlist", json={"ticker_symbol": f"ZQ{i:03d}"}, headers=headers)
        assert res.status_code == 200, res.text

    over_limit = client.post("/api/v1/watchlist", json={"ticker_symbol": "ZQOVER"}, headers=headers)
    assert over_limit.status_code == 402
    assert "upgrade" in over_limit.json()["detail"].lower()

    # Re-adding an *already-owned* symbol must never be blocked by the quota
    # — the endpoint's existing idempotent-add short-circuit runs first.
    already_owned = client.post("/api/v1/watchlist", json={"ticker_symbol": "ZQ000"}, headers=headers)
    assert already_owned.status_code == 200


def _login_as(client, test_engine, *, email: str, role: str) -> str:
    """Direct-DB user creation with an explicit role (rather than through
    POST /auth/register, whose bootstrap rule makes the *first ever*
    registration in the shared test DB an operator regardless of what this
    test asks for — see test_platform_settings.py's identical helper)."""
    from sqlalchemy.orm import sessionmaker

    from app.core.security import hash_password
    from app.db.models.user import User

    session = sessionmaker(bind=test_engine)()
    try:
        session.add(User(email=email, password_hash=hash_password("correct-horse-battery"), role=role))
        session.commit()
    finally:
        session.close()

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse-battery"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_alert_rule_creation_is_refused_once_the_free_plan_limit_is_reached(client, test_engine, auth_on):
    # Rule creation requires a *tracked* ticker (see alerts.py's _validate)
    # — an operator adds a dedicated test-only symbol to the universe first.
    operator_token = _login_as(client, test_engine, email="alerts-quota-op@example.com", role="operator")
    add_res = client.post(
        "/api/v1/universe",
        json={"symbol": "ZQALRT", "asset_type": "STOCK", "name": "ZQALRT", "exchange": "NASDAQ"},
        headers=_auth_header(operator_token),
    )
    assert add_res.status_code in (201, 409), add_res.text

    try:
        token = _login_as(client, test_engine, email="alerts-quota@example.com", role="user")
        headers = _auth_header(token)
        limit = PLAN_LIMITS["free"]["max_alert_rules"]

        for _ in range(limit):
            res = client.post(
                "/api/v1/alerts/rules",
                json={"ticker_symbol": "ZQALRT", "condition_type": "price", "comparison": "above", "threshold_value": 999999},
                headers=headers,
            )
            assert res.status_code == 200, res.text

        over_limit = client.post(
            "/api/v1/alerts/rules",
            json={"ticker_symbol": "ZQALRT", "condition_type": "price", "comparison": "above", "threshold_value": 999999},
            headers=headers,
        )
        assert over_limit.status_code == 402
        assert "upgrade" in over_limit.json()["detail"].lower()
    finally:
        client.patch(
            "/api/v1/universe/ZQALRT", json={"is_active": False}, headers=_auth_header(operator_token)
        )
