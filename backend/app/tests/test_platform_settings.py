"""Safe Mode runtime override — Phase 11's one genuinely new admin
capability. Everything else the Admin UI shows (provider health, model
registry, schema readiness, asset universe) is served by endpoints that
already existed and are already tested elsewhere (test_monitoring.py,
test_models*.py, test_universe_endpoint.py).
"""
from app.db.models.platform_setting import PlatformSetting
from app.db.models.user import User
from app.services.platform_settings import (
    get_platform_setting,
    is_safe_mode_active,
    set_safe_mode_override,
)
from app.services.risk.engine import evaluate_risk


def test_no_override_row_falls_back_to_env_default(db_session):
    assert is_safe_mode_active(db_session) is False  # Settings default is False


def test_operator_override_forces_safe_mode_active(db_session):
    operator = User(email="platform-settings-op1@example.com", password_hash="x", role="operator")
    db_session.add(operator)
    db_session.commit()

    set_safe_mode_override(db_session, True, operator)
    assert is_safe_mode_active(db_session) is True

    row = get_platform_setting(db_session)
    assert row.updated_by_user_id == operator.id
    assert row.updated_at is not None


def test_clearing_override_reverts_to_env_default(db_session):
    operator = User(email="platform-settings-op2@example.com", password_hash="x", role="operator")
    db_session.add(operator)
    db_session.commit()

    set_safe_mode_override(db_session, True, operator)
    assert is_safe_mode_active(db_session) is True

    set_safe_mode_override(db_session, None, operator)
    assert is_safe_mode_active(db_session) is False


def test_evaluate_risk_honors_the_db_backed_override(db_session):
    operator = User(email="platform-settings-op3@example.com", password_hash="x", role="operator")
    db_session.add(operator)
    db_session.commit()

    # Every other threshold cleared — only Safe Mode can reject this.
    assert evaluate_risk(90.0, 5.0, db=db_session).passed

    set_safe_mode_override(db_session, True, operator)
    verdict = evaluate_risk(90.0, 5.0, db=db_session)
    assert not verdict.passed
    assert "safe mode" in verdict.reasons[0].lower()


def test_evaluate_risk_with_no_db_falls_back_to_env_default_unchanged():
    # No db passed at all (e.g. a bare unit test) — identical to pre-Phase-11 behavior.
    assert evaluate_risk(90.0, 5.0).passed


def test_evaluate_risk_precomputed_safe_mode_bypasses_db_entirely():
    # The scanner's per-symbol worker-thread path: never touch `db` inside
    # a ThreadPoolExecutor callback, resolve the flag once beforehand.
    assert not evaluate_risk(90.0, 5.0, safe_mode=True).passed
    assert evaluate_risk(90.0, 5.0, safe_mode=False).passed


# --- API-level tests ---------------------------------------------------


def test_get_and_set_safe_mode_via_api(client):
    res = client.get("/api/v1/admin/safe-mode")
    assert res.status_code == 200
    body = res.json()
    assert body["override"] is None
    assert body["effective"] is False

    set_res = client.post("/api/v1/admin/safe-mode", json={"override": True})
    assert set_res.status_code == 200
    assert set_res.json()["override"] is True
    assert set_res.json()["effective"] is True

    clear_res = client.post("/api/v1/admin/safe-mode", json={"override": None})
    assert clear_res.status_code == 200
    assert clear_res.json()["override"] is None
    assert clear_res.json()["effective"] is False


def _login_as(client, test_engine, *, email: str, role: str) -> str:
    """Creates a user with an explicit role directly in the DB (rather than
    through POST /auth/register, whose bootstrap rule makes the *first ever*
    registration in the shared test DB an operator regardless of what this
    test asks for — see test_auth.py::test_register_login_and_access, which
    depends on being that first registration) and logs in for a real token."""
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


def test_safe_mode_endpoints_reject_anonymous_and_regular_users_when_auth_is_required(client, test_engine):
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    try:
        assert client.get("/api/v1/admin/safe-mode").status_code == 401

        token = _login_as(client, test_engine, email="admin-regular@example.com", role="user")
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/admin/safe-mode", headers=headers).status_code == 403
        assert client.post("/api/v1/admin/safe-mode", json={"override": True}, headers=headers).status_code == 403
    finally:
        settings.auth_required = original


def test_safe_mode_endpoints_allow_operator_when_auth_is_required(client, test_engine):
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    try:
        token = _login_as(client, test_engine, email="admin-operator@example.com", role="operator")
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/admin/safe-mode", headers=headers).status_code == 200
        set_res = client.post("/api/v1/admin/safe-mode", json={"override": True}, headers=headers)
        assert set_res.status_code == 200
        assert set_res.json()["override"] is True
    finally:
        # This test's whole point is proving the override write path works
        # — but leaving Safe Mode stuck "on" in the shared test DB would
        # make every risk-gated action (paper trades, scanner) fail for
        # every test that runs afterward in this session. Auth doesn't need
        # to be required to clear it — the dev principal is an operator too.
        settings.auth_required = original
        client.post("/api/v1/admin/safe-mode", json={"override": None})


def test_autonomous_trading_endpoints_reject_anonymous_and_regular_users_when_auth_is_required(client, test_engine):
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    try:
        assert client.get("/api/v1/admin/autonomous-trading").status_code == 401

        token = _login_as(client, test_engine, email="auto-regular@example.com", role="user")
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/admin/autonomous-trading", headers=headers).status_code == 403
        assert client.post("/api/v1/admin/autonomous-trading", json={"paused": True}, headers=headers).status_code == 403
    finally:
        settings.auth_required = original


def test_autonomous_trading_endpoints_allow_operator_when_auth_is_required(client, test_engine):
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    try:
        token = _login_as(client, test_engine, email="auto-operator@example.com", role="operator")
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/admin/autonomous-trading", headers=headers).status_code == 200
        set_res = client.post("/api/v1/admin/autonomous-trading", json={"paused": True}, headers=headers)
        assert set_res.status_code == 200
        assert set_res.json()["paused"] is True
    finally:
        # Same reasoning as the safe-mode test above — never leave this
        # stuck "on" in the shared test DB for every later test.
        settings.auth_required = original
        client.post("/api/v1/admin/autonomous-trading", json={"paused": False})
