"""GET /admin/users and PATCH /admin/users/{id}/plan — Phase 13's only path
for changing a user's plan during this beta (no self-serve checkout
exists).

Named to sort after test_auth.py (see test_platform_settings.py for the
same discipline, applied first): auth.py's registration bootstrap rule
("the first non-dev-email User row in the DB becomes operator") counts
ANY row with a real email, not just ones created through POST
/auth/register — so even this file's direct-DB user creation would
silently steal that "first registration" slot from
test_auth.py::test_register_login_and_access if this ran first in the
shared in-memory test DB.
"""
import pytest
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.models.user import User


@pytest.fixture
def auth_on():
    """Without this, AUTH_REQUIRED=false (the test default) makes every
    request resolve to the dev operator regardless of which token is
    sent (see api/deps.py's get_current_user) — every test below needs
    this to actually exercise role-based authorization at all."""
    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


def _create_and_login(client, test_engine, *, email: str, role: str = "user", plan: str = "free") -> tuple[str, int]:
    session = sessionmaker(bind=test_engine)()
    try:
        user = User(email=email, password_hash=hash_password("correct-horse-battery"), role=role, plan=plan)
        session.add(user)
        session.commit()
        user_id = user.id
    finally:
        session.close()

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse-battery"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"], user_id


def test_list_users_requires_operator(client, test_engine, auth_on):
    regular_token, _ = _create_and_login(client, test_engine, email="admin-users-regular@example.com", role="user")
    denied = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {regular_token}"})
    assert denied.status_code == 403


def test_operator_can_list_users_and_see_their_plans(client, test_engine, auth_on):
    operator_token, _ = _create_and_login(client, test_engine, email="admin-users-op1@example.com", role="operator")
    _, target_id = _create_and_login(client, test_engine, email="admin-users-target1@example.com", role="user")

    res = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {operator_token}"})
    assert res.status_code == 200
    by_id = {u["id"]: u for u in res.json()}
    assert by_id[target_id]["email"] == "admin-users-target1@example.com"
    assert by_id[target_id]["plan"] == "free"


def test_operator_can_change_a_users_plan(client, test_engine, auth_on):
    operator_token, _ = _create_and_login(client, test_engine, email="admin-users-op2@example.com", role="operator")
    _, target_id = _create_and_login(client, test_engine, email="admin-users-target2@example.com", role="user")

    res = client.patch(
        f"/api/v1/admin/users/{target_id}/plan",
        json={"plan": "pro"},
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert res.status_code == 200
    assert res.json()["plan"] == "pro"

    listed = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {operator_token}"})
    by_id = {u["id"]: u for u in listed.json()}
    assert by_id[target_id]["plan"] == "pro"


def test_setting_an_unknown_plan_is_rejected(client, test_engine, auth_on):
    operator_token, _ = _create_and_login(client, test_engine, email="admin-users-op3@example.com", role="operator")
    _, target_id = _create_and_login(client, test_engine, email="admin-users-target3@example.com", role="user")

    res = client.patch(
        f"/api/v1/admin/users/{target_id}/plan",
        json={"plan": "diamond-super-tier"},
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert res.status_code == 400


def test_setting_the_plan_for_an_unknown_user_404s(client, test_engine, auth_on):
    operator_token, _ = _create_and_login(client, test_engine, email="admin-users-op4@example.com", role="operator")

    res = client.patch(
        "/api/v1/admin/users/99999999/plan",
        json={"plan": "pro"},
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert res.status_code == 404
