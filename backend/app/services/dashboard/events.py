"""Platform-wide dashboard event channel — reuses the existing per-symbol
EventBus (services/streaming/core.py) with a reserved pseudo-symbol key,
rather than building a second pub/sub mechanism. Publishers across the
platform (alerts firing, autonomous trades opening/closing, an operator
flipping Safe Mode or the autonomous-trading emergency stop) call
publish_dashboard_event(); GET /stream/dashboard
(api/v1/endpoints/stream.py) is the one subscriber-facing SSE endpoint.

Never a source of truth itself — every event here is a "something
changed, go re-fetch the real data" nudge, not a payload the frontend
trusts standalone (mirrors the existing per-symbol stream's own
discipline: `bar.updated`/`signal.updated` events, not authoritative
state).
"""
from __future__ import annotations

DASHBOARD_CHANNEL = "__dashboard__"


def publish_dashboard_event(event_type: str, payload: dict) -> None:
    from app.services.streaming.service import get_stream_service

    get_stream_service().bus.publish(DASHBOARD_CHANNEL, event_type, payload)
