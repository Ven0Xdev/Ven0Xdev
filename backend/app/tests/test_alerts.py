"""Alert rule evaluation and the /alerts API — Phase 10.

Deterministic real-analysis fixture: a mock-universe symbol is analyzed
for real (not fabricated), then rule thresholds are set relative to its
actual computed values, so triggering/not-triggering is a genuine
computation, not a scripted stand-in.
"""
from datetime import datetime, timedelta, timezone

from app.db.models.alert import AlertEvent, AlertRule
from app.db.models.signal import Signal
from app.services.alerts.evaluator import ALERT_COOLDOWN, evaluate_rules_for_symbol
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker


def _real_analysis():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    return symbol, analyze_ticker(symbol, provider=provider)


def test_price_above_rule_fires_when_crossed(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="above", threshold_value=analysis.current_price - 0.01,
    )
    db_session.add(rule)
    db_session.commit()

    fired = evaluate_rules_for_symbol(db_session, symbol, analysis)

    assert len(fired) == 1
    assert fired[0].ticker_symbol == symbol
    assert fired[0].observed_value == analysis.current_price
    assert "price" in fired[0].message
    db_session.refresh(rule)
    assert rule.last_fired_at is not None


def test_price_below_rule_does_not_fire_when_not_crossed(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="below", threshold_value=0.0001,  # essentially unreachable
    )
    db_session.add(rule)
    db_session.commit()

    fired = evaluate_rules_for_symbol(db_session, symbol, analysis)
    assert fired == []


def test_ai_score_and_manipulation_risk_conditions(db_session):
    symbol, analysis = _real_analysis()
    score_rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="ai_score",
        comparison="above", threshold_value=analysis.overall_ai_score - 1,
    )
    risk_rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="manipulation_risk",
        comparison="above", threshold_value=analysis.manipulation_risk - 1,
    )
    db_session.add_all([score_rule, risk_rule])
    db_session.commit()

    fired = evaluate_rules_for_symbol(db_session, symbol, analysis)
    assert len(fired) == 2


def test_inactive_rule_never_fires(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="above", threshold_value=analysis.current_price - 0.01,
        is_active=False,
    )
    db_session.add(rule)
    db_session.commit()

    assert evaluate_rules_for_symbol(db_session, symbol, analysis) == []


def test_rule_respects_cooldown_and_does_not_double_fire(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="above", threshold_value=analysis.current_price - 0.01,
    )
    db_session.add(rule)
    db_session.commit()

    first = evaluate_rules_for_symbol(db_session, symbol, analysis)
    assert len(first) == 1

    second = evaluate_rules_for_symbol(db_session, symbol, analysis)
    assert second == [], "still inside the cooldown window — must not re-fire"


def test_rule_fires_again_after_cooldown_elapses(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="price",
        comparison="above", threshold_value=analysis.current_price - 0.01,
    )
    db_session.add(rule)
    db_session.commit()

    past = datetime.now(timezone.utc) - ALERT_COOLDOWN - timedelta(minutes=1)
    fired_once = evaluate_rules_for_symbol(db_session, symbol, analysis, now=past)
    assert len(fired_once) == 1

    fired_again = evaluate_rules_for_symbol(db_session, symbol, analysis, now=datetime.now(timezone.utc))
    assert len(fired_again) == 1


def test_signal_status_condition_reads_the_latest_persisted_signal(db_session):
    symbol, analysis = _real_analysis()
    db_session.add(Signal(ticker_symbol=symbol, status="WATCH"))
    db_session.commit()
    db_session.add(Signal(ticker_symbol=symbol, status="POSSIBLE_ENTRY"))
    db_session.commit()

    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="signal_status",
        comparison="equals", target_status="POSSIBLE_ENTRY",
    )
    db_session.add(rule)
    db_session.commit()

    fired = evaluate_rules_for_symbol(db_session, symbol, analysis)
    assert len(fired) == 1
    assert fired[0].observed_status == "POSSIBLE_ENTRY"


def test_signal_status_condition_does_not_fire_with_no_recorded_signal(db_session):
    symbol, analysis = _real_analysis()
    rule = AlertRule(
        user_id=1, ticker_symbol=symbol, condition_type="signal_status",
        comparison="equals", target_status="POSSIBLE_ENTRY",
    )
    db_session.add(rule)
    db_session.commit()

    assert evaluate_rules_for_symbol(db_session, symbol, analysis) == []


def test_rules_for_a_different_symbol_are_never_evaluated(db_session):
    symbol, analysis = _real_analysis()
    other_symbol = "ZUNRELATED"
    rule = AlertRule(
        user_id=1, ticker_symbol=other_symbol, condition_type="price",
        comparison="above", threshold_value=0.0,
    )
    db_session.add(rule)
    db_session.commit()

    assert evaluate_rules_for_symbol(db_session, symbol, analysis) == []


# --- API-level tests -------------------------------------------------
#
# The `client` fixture's lifespan seeds the real 20-asset universe into a
# *different* physical DB than the one `client`'s own requests read (see
# test_api_stocks.py's `_ensure_test_symbol_in_universe` for the same
# discipline) — so a rule that needs to be *accepted* here must add its
# own dedicated test-only tracked symbol through the client itself.


def _ensure_test_symbol_in_universe(client, symbol):
    res = client.post(
        "/api/v1/universe",
        json={"symbol": symbol, "asset_type": "STOCK", "name": symbol, "exchange": "NASDAQ"},
    )
    assert res.status_code in (201, 409), res.text


def _retire_test_symbol(client, symbol):
    client.patch(f"/api/v1/universe/{symbol}", json={"is_active": False})


def test_create_list_and_delete_rule_via_api(client):
    _ensure_test_symbol_in_universe(client, "ZALRT")
    try:
        create_res = client.post(
            "/api/v1/alerts/rules",
            json={"ticker_symbol": "zalrt", "condition_type": "price", "comparison": "above", "threshold_value": 5.0},
        )
        assert create_res.status_code == 200, create_res.text
        rule = create_res.json()
        assert rule["ticker_symbol"] == "ZALRT"
        assert rule["is_active"] is True

        list_res = client.get("/api/v1/alerts/rules")
        assert any(r["id"] == rule["id"] for r in list_res.json())

        disable_res = client.patch(f"/api/v1/alerts/rules/{rule['id']}?is_active=false")
        assert disable_res.status_code == 200
        assert disable_res.json()["is_active"] is False

        delete_res = client.delete(f"/api/v1/alerts/rules/{rule['id']}")
        assert delete_res.status_code == 200
        assert all(r["id"] != rule["id"] for r in client.get("/api/v1/alerts/rules").json())
    finally:
        _retire_test_symbol(client, "ZALRT")


def test_create_rule_rejects_a_ticker_outside_the_tracked_universe(client):
    # workers/prediction_scheduler.py's automatic evaluation only ever
    # visits the Asset Universe Manager's active universe (the 20 real
    # seed symbols) — a rule on any other symbol would silently never
    # fire. Must be refused at creation, not accepted and left dead.
    res = client.post(
        "/api/v1/alerts/rules",
        json={"ticker_symbol": "AXNT", "condition_type": "price", "comparison": "above", "threshold_value": 5.0},
    )
    assert res.status_code == 400
    assert "tracked asset universe" in res.json()["detail"]


def test_create_rule_rejects_invalid_condition_type(client):
    res = client.post(
        "/api/v1/alerts/rules",
        json={"ticker_symbol": "AAPL", "condition_type": "bogus", "comparison": "above", "threshold_value": 5.0},
    )
    assert res.status_code == 400


def test_create_price_rule_without_threshold_is_rejected(client):
    res = client.post(
        "/api/v1/alerts/rules",
        json={"ticker_symbol": "AAPL", "condition_type": "price", "comparison": "above"},
    )
    assert res.status_code == 400


def test_create_signal_status_rule_without_target_status_is_rejected(client):
    res = client.post(
        "/api/v1/alerts/rules",
        json={"ticker_symbol": "AAPL", "condition_type": "signal_status", "comparison": "equals"},
    )
    assert res.status_code == 400


def test_events_list_and_acknowledge(client, test_engine):
    from sqlalchemy.orm import sessionmaker

    _ensure_test_symbol_in_universe(client, "ZALRT2")
    try:
        create_res = client.post(
            "/api/v1/alerts/rules",
            json={"ticker_symbol": "ZALRT2", "condition_type": "price", "comparison": "above", "threshold_value": 0.0001},
        )
        rule_id = create_res.json()["id"]

        # A short-lived session bound to the same test_engine the `client`
        # fixture itself uses internally — never a second long-held
        # transaction like `db_session` opens, which is what the conftest.py
        # `client` fixture docstring warns would conflict.
        Session = sessionmaker(bind=test_engine)
        session = Session()
        try:
            db_rule = session.query(AlertRule).filter_by(id=rule_id).one()
            event = AlertEvent(
                rule_id=db_rule.id, user_id=db_rule.user_id, ticker_symbol="ZALRT2",
                fired_at=datetime.now(timezone.utc), message="test fire", observed_value=1.0,
            )
            session.add(event)
            session.commit()
            event_id = event.id
        finally:
            session.close()

        events_res = client.get("/api/v1/alerts/events")
        assert any(e["id"] == event_id for e in events_res.json())

        ack_res = client.post(f"/api/v1/alerts/events/{event_id}/acknowledge")
        assert ack_res.status_code == 200
        assert ack_res.json()["acknowledged"] is True
    finally:
        _retire_test_symbol(client, "ZALRT2")
