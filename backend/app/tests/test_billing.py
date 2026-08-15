"""GET /billing/plans and /billing/status — Phase 13. No payment is ever
collected or simulated here (see services/billing/provider.py's
NullBillingProvider) — these tests only prove the honest not-configured
status and usage counters are correct.
"""
from app.core.entitlements import PLAN_LIMITS


def test_list_plans_returns_the_real_plan_catalog(client):
    res = client.get("/api/v1/billing/plans")
    assert res.status_code == 200
    assert res.json()["plans"] == PLAN_LIMITS


def test_billing_status_reports_free_plan_and_honest_unconfigured_billing(client):
    res = client.get("/api/v1/billing/status")
    assert res.status_code == 200
    body = res.json()
    assert body["plan"] == "free"
    assert body["billing_configured"] is False
    assert "not configured" in body["billing_message"].lower()
    assert body["usage"]["max_watchlist_items"] == PLAN_LIMITS["free"]["max_watchlist_items"]
    assert body["usage"]["max_alert_rules"] == PLAN_LIMITS["free"]["max_alert_rules"]


def test_billing_status_usage_reflects_real_owned_rows(client):
    before = client.get("/api/v1/billing/status").json()["usage"]["watchlist_items"]

    add = client.post("/api/v1/watchlist", json={"ticker_symbol": "ZBILL"})
    assert add.status_code == 200
    try:
        after = client.get("/api/v1/billing/status").json()["usage"]["watchlist_items"]
        assert after == before + 1
    finally:
        client.delete("/api/v1/watchlist/ZBILL")
