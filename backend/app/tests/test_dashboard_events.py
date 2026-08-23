"""Platform-wide dashboard event channel (services/dashboard/events.py) —
alerts firing, autonomous trades, and Safe Mode / the autonomous-trading
emergency stop being flipped all publish here; GET /stream/dashboard is
the one subscriber-facing SSE endpoint."""
from datetime import datetime, timedelta, timezone

from app.db.models.alert import AlertRule
from app.services.alerts.evaluator import evaluate_rules_for_symbol
from app.services.dashboard.events import DASHBOARD_CHANNEL, publish_dashboard_event
from app.services.platform_settings import set_autonomous_trading_paused, set_safe_mode_override
from app.services.streaming.service import get_stream_service


class _FakeOperator:
    id = 777


def test_publish_dashboard_event_is_delivered_to_a_subscriber(db_session):
    bus = get_stream_service().bus
    queue = bus.subscribe(DASHBOARD_CHANNEL)
    try:
        publish_dashboard_event("test.event", {"foo": "bar"})
        event = queue.get_nowait()
        assert event["type"] == "test.event"
        assert event["payload"] == {"foo": "bar"}
        assert "ts" in event
    finally:
        bus.unsubscribe(DASHBOARD_CHANNEL, queue)


def test_a_fired_alert_publishes_to_the_dashboard_channel(db_session):
    from app.schemas.stock import StockAnalysis

    rule = AlertRule(
        user_id=1, ticker_symbol="AAPL", condition_type="price", comparison="above",
        threshold_value=1.0, is_active=True,
    )
    db_session.add(rule)
    db_session.commit()

    bus = get_stream_service().bus
    queue = bus.subscribe(DASHBOARD_CHANNEL)
    try:
        analysis = StockAnalysis.model_construct(current_price=999.0, manipulation_risk=0, overall_ai_score=50)
        fired = evaluate_rules_for_symbol(db_session, "AAPL", analysis, now=datetime.now(timezone.utc))
        assert len(fired) == 1

        event = queue.get_nowait()
        assert event["type"] == "alert.fired"
        assert event["payload"]["ticker_symbol"] == "AAPL"
        assert event["payload"]["id"] == fired[0].id
    finally:
        bus.unsubscribe(DASHBOARD_CHANNEL, queue)


def test_an_alert_still_in_cooldown_publishes_nothing(db_session):
    from app.schemas.stock import StockAnalysis

    rule = AlertRule(
        user_id=1, ticker_symbol="MSFT", condition_type="price", comparison="above",
        threshold_value=1.0, is_active=True, last_fired_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(rule)
    db_session.commit()

    bus = get_stream_service().bus
    queue = bus.subscribe(DASHBOARD_CHANNEL)
    try:
        analysis = StockAnalysis.model_construct(current_price=999.0, manipulation_risk=0, overall_ai_score=50)
        fired = evaluate_rules_for_symbol(db_session, "MSFT", analysis, now=datetime.now(timezone.utc))
        assert fired == []
        assert queue.empty()
    finally:
        bus.unsubscribe(DASHBOARD_CHANNEL, queue)


def test_safe_mode_override_publishes_a_dashboard_event(db_session):
    bus = get_stream_service().bus
    queue = bus.subscribe(DASHBOARD_CHANNEL)
    try:
        set_safe_mode_override(db_session, True, _FakeOperator())
        event = queue.get_nowait()
        assert event["type"] == "platform.safe_mode_changed"
        assert event["payload"]["override"] is True
    finally:
        bus.unsubscribe(DASHBOARD_CHANNEL, queue)
        set_safe_mode_override(db_session, None, _FakeOperator())  # never leave Safe Mode stuck on


def test_autonomous_trading_pause_publishes_a_dashboard_event(db_session):
    bus = get_stream_service().bus
    queue = bus.subscribe(DASHBOARD_CHANNEL)
    try:
        set_autonomous_trading_paused(db_session, True, _FakeOperator())
        event = queue.get_nowait()
        assert event["type"] == "platform.autonomous_trading_paused_changed"
        assert event["payload"]["paused"] is True
    finally:
        bus.unsubscribe(DASHBOARD_CHANNEL, queue)
        set_autonomous_trading_paused(db_session, False, _FakeOperator())


# GET /stream/dashboard's route-registration-order correctness (it must
# be matched before /{symbol}, so "dashboard" is never treated as a
# ticker symbol) is verified live against the real Docker deployment
# instead of here: Starlette's TestClient cannot cleanly consume this
# endpoint's intentionally-infinite SSE stream (it blocks waiting for the
# response to "complete", which a stream with a 15s keepalive loop never
# does), and this app's routing internals aren't straightforwardly
# introspectable from a unit test either. Every other test in this file
# covers the real event-publishing behavior without needing to open the
# literal HTTP stream.
