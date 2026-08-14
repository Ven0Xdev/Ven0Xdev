"""Authentication, authorization, ownership isolation, and rate limiting."""
import pytest

from app.core import security
from app.core.config import get_settings
from app.core.ratelimit import check_rate_limit, reset_for_tests


@pytest.fixture
def auth_on():
    """Flip AUTH_REQUIRED for a test and restore afterwards (settings is a
    cached singleton, so attribute mutation is the reliable override)."""
    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


@pytest.fixture
def auth_rate_limit_on():
    """Flip RATE_LIMIT_ENABLED (and lower the per-minute cap so a test
    doesn't need dozens of requests to trip it) for a test, and reset the
    shared in-process token-bucket state before and after so this test
    can't leak into — or be polluted by — any other test hitting
    /api/v1/auth/*."""
    settings = get_settings()
    original_enabled = settings.rate_limit_enabled
    original_limit = settings.auth_rate_limit_per_minute
    settings.rate_limit_enabled = True
    settings.auth_rate_limit_per_minute = 3
    reset_for_tests()
    yield settings
    settings.rate_limit_enabled = original_enabled
    settings.auth_rate_limit_per_minute = original_limit
    reset_for_tests()


def _register(client, email, password="correct-horse-battery"):
    return client.post("/api/v1/auth/register", json={"email": email, "password": password})


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- primitives -------------------------------------------------------

def test_password_hash_roundtrip():
    hashed = security.hash_password("s3cret-passphrase")
    assert hashed != "s3cret-passphrase"
    assert security.verify_password("s3cret-passphrase", hashed)
    assert not security.verify_password("wrong", hashed)


def test_token_type_is_enforced():
    access = security.create_access_token(1, "user", 0)
    with pytest.raises(security.TokenError, match="type"):
        security.decode_token(access, security.REFRESH_TOKEN_TYPE)


def test_rate_limiter_blocks_and_recovers():
    reset_for_tests()
    allowed = [check_rate_limit("k", per_minute=3)[0] for _ in range(4)]
    assert allowed == [True, True, True, False]
    ok, retry_after = check_rate_limit("k", per_minute=3)
    assert not ok and retry_after >= 1


# ---------- dev mode (auth off): everything keeps working ------------------------

def test_dev_mode_needs_no_token(client):
    assert client.get("/api/v1/watchlist").status_code == 200
    assert client.get("/api/v1/auth/me").json()["email"] == "dev@local"


# ---------- enforcement (auth on) --------------------------------------------------

def test_protected_endpoints_require_token(client, auth_on):
    assert client.get("/api/v1/watchlist").status_code == 401
    assert client.post("/api/v1/scan/run-cycle").status_code == 401
    assert client.post("/api/v1/models/1/promote").status_code == 401


def test_register_login_and_access(client, auth_on):
    r = _register(client, "first@example.com")
    assert r.status_code == 201
    tokens = r.json()

    me = client.get("/api/v1/auth/me", headers=_auth_header(tokens["access_token"]))
    assert me.status_code == 200
    assert me.json()["role"] == "operator"  # first real account bootstraps as operator

    login = client.post("/api/v1/auth/login", json={"email": "first@example.com", "password": "correct-horse-battery"})
    assert login.status_code == 200

    bad = client.post("/api/v1/auth/login", json={"email": "first@example.com", "password": "nope-nope-nope"})
    assert bad.status_code == 401


def test_refresh_flow(client, auth_on):
    tokens = _register(client, "refresh@example.com").json()
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert client.get("/api/v1/auth/me", headers=_auth_header(refreshed.json()["access_token"])).status_code == 200
    # An access token must not be usable as a refresh token.
    wrong = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert wrong.status_code == 401


def test_operator_gate_blocks_regular_users(client, auth_on):
    _register(client, "op@example.com")          # operator (first)
    user_tokens = _register(client, "user2@example.com").json()  # regular

    denied = client.post("/api/v1/models/1/promote", headers=_auth_header(user_tokens["access_token"]))
    assert denied.status_code == 403


def test_watchlist_isolation_between_users(client, auth_on):
    a = _register(client, "alice@example.com").json()
    b = _register(client, "bob@example.com").json()

    client.post("/api/v1/watchlist", json={"ticker_symbol": "AXNT"}, headers=_auth_header(a["access_token"]))
    bob_list = client.get("/api/v1/watchlist", headers=_auth_header(b["access_token"])).json()
    assert bob_list == []
    alice_list = client.get("/api/v1/watchlist", headers=_auth_header(a["access_token"])).json()
    assert [i["ticker_symbol"] for i in alice_list] == ["AXNT"]


def test_chat_session_hijack_blocked(client, auth_on):
    a = _register(client, "chat-a@example.com").json()
    b = _register(client, "chat-b@example.com").json()

    client.post("/api/v1/chat/message", json={"session_key": "priv-1", "message": "hello"},
                headers=_auth_header(a["access_token"]))
    stolen = client.get("/api/v1/chat/history/priv-1", headers=_auth_header(b["access_token"]))
    assert stolen.status_code == 403


def test_sse_stream_accepts_token_as_query_param(client, auth_on):
    """EventSource (used by the live chart) cannot set an Authorization
    header at all — the query-param fallback in get_current_user exists
    solely so that path still authenticates."""
    tokens = _register(client, "sse@example.com").json()
    r = client.get(f"/api/v1/stream/AXNT/health?token={tokens['access_token']}")
    assert r.status_code == 200


def test_sse_query_param_rejects_invalid_token(client, auth_on):
    assert client.get("/api/v1/stream/AXNT/health?token=garbage").status_code == 401
    assert client.get("/api/v1/stream/AXNT/health").status_code == 401  # neither header nor query param


def test_header_takes_priority_over_query_param(client, auth_on):
    """An Authorization header is never silently bypassed by also supplying
    a valid query-param token — the header is checked and, if bad, the
    request is rejected outright rather than falling back."""
    tokens = _register(client, "priority@example.com").json()
    r = client.get(
        f"/api/v1/stream/AXNT/health?token={tokens['access_token']}",
        headers={"Authorization": "Bearer garbage"},
    )
    assert r.status_code == 401


def test_revocation_via_token_version(client, auth_on, test_engine):
    tokens = _register(client, "revoke@example.com").json()

    from sqlalchemy.orm import sessionmaker

    from app.db.models.user import User

    session = sessionmaker(bind=test_engine)()
    try:
        user = session.query(User).filter_by(email="revoke@example.com").one()
        user.token_version += 1
        session.commit()
    finally:
        session.close()

    assert client.get("/api/v1/auth/me", headers=_auth_header(tokens["access_token"])).status_code == 401


# ---------- auth endpoint rate limiting -------------------------------------

def test_login_rate_limit_disabled_by_default(client):
    """RATE_LIMIT_ENABLED=false (the default) — repeated bad logins are
    never throttled, only rejected on their own merits (401)."""
    for _ in range(10):
        r = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})
        assert r.status_code == 401


def test_login_rate_limit_blocks_after_threshold(client, auth_rate_limit_on):
    responses = [
        client.post("/api/v1/auth/login", json={"email": "ratelimit-login@example.com", "password": "wrong-password"})
        for _ in range(4)
    ]
    statuses = [r.status_code for r in responses]
    # First 3 are judged on their own merits (401: no such account); the
    # 4th trips the per-minute cap regardless of credentials.
    assert statuses == [401, 401, 401, 429]
    assert "Retry-After" in responses[-1].headers


def test_login_rate_limit_never_reveals_which_bucket_tripped(client, auth_rate_limit_on):
    """Same generic 429 body whether the IP bucket or the per-email bucket
    is what tripped — an attacker learns nothing about which limit fired,
    and by extension nothing about whether the targeted email exists."""
    for _ in range(3):
        client.post("/api/v1/auth/login", json={"email": "distinct-1@example.com", "password": "x"})
    r = client.post("/api/v1/auth/login", json={"email": "distinct-2@example.com", "password": "x"})
    assert r.status_code == 429
    assert "wait" in r.json()["detail"].lower()


def test_register_rate_limit_blocks_after_threshold(client, auth_rate_limit_on):
    responses = [
        client.post("/api/v1/auth/register", json={"email": f"ratelimit-reg-{i}@example.com", "password": "correct-horse-battery"})
        for i in range(4)
    ]
    statuses = [r.status_code for r in responses]
    assert statuses == [201, 201, 201, 429]


def test_refresh_rate_limit_blocks_after_threshold(client, auth_rate_limit_on):
    responses = [client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-real-token"}) for _ in range(4)]
    statuses = [r.status_code for r in responses]
    assert statuses == [401, 401, 401, 429]


def test_login_rate_limit_recovers_after_reset(client, auth_rate_limit_on):
    for _ in range(3):
        client.post("/api/v1/auth/login", json={"email": "recovers@example.com", "password": "wrong"})
    assert client.post("/api/v1/auth/login", json={"email": "recovers@example.com", "password": "wrong"}).status_code == 429

    reset_for_tests()  # simulates the bucket having refilled over time

    assert client.post("/api/v1/auth/login", json={"email": "recovers@example.com", "password": "wrong"}).status_code == 401
