"""Alert rule evaluation — piggybacks on the same periodic pass
`workers/prediction_scheduler.py` already makes over the active multi-asset
universe (see that module's docstring) rather than standing up a fifth
independent scheduler. Called once per prediction-scheduler cycle with the
fresh `StockAnalysis` that cycle already computed for each symbol, so
evaluating alerts costs no extra provider calls.

`signal_status` conditions read the most recently *persisted* `Signal` row
for the ticker (whatever the streaming/signal-engine path last recorded) —
a passive read, never a forced live re-evaluation just to check an alert,
and never fabricated when no signal has ever been recorded for that symbol.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.alert import AlertEvent, AlertRule
from app.db.models.signal import Signal
from app.schemas.stock import StockAnalysis

# A rule whose condition stays true every cycle must not re-fire every
# cycle — this is the "don't spam the user" floor, not a delivery
# guarantee window.
ALERT_COOLDOWN = timedelta(hours=1)

_VALUE_LABELS = {"price": "price", "ai_score": "AI score", "manipulation_risk": "manipulation risk"}


def _observed_value(rule: AlertRule, analysis: StockAnalysis) -> float | None:
    if rule.condition_type == "price":
        return analysis.current_price
    if rule.condition_type == "ai_score":
        return analysis.overall_ai_score
    if rule.condition_type == "manipulation_risk":
        return analysis.manipulation_risk
    return None


def _latest_signal_status(db: Session, symbol: str) -> str | None:
    row = (
        db.query(Signal.status)
        .filter_by(ticker_symbol=symbol)
        .order_by(Signal.created_at.desc())
        .first()
    )
    return row[0] if row else None


def _condition_met(rule: AlertRule, analysis: StockAnalysis, db: Session) -> tuple[bool, float | None, str | None]:
    if rule.condition_type == "signal_status":
        observed_status = _latest_signal_status(db, rule.ticker_symbol)
        return observed_status is not None and observed_status == rule.target_status, None, observed_status

    observed = _observed_value(rule, analysis)
    if observed is None or rule.threshold_value is None:
        return False, observed, None
    if rule.comparison == "above":
        met = observed > rule.threshold_value
    elif rule.comparison == "below":
        met = observed < rule.threshold_value
    else:
        met = observed == rule.threshold_value
    return met, observed, None


def _message(rule: AlertRule, observed_value: float | None, observed_status: str | None) -> str:
    if rule.condition_type == "signal_status":
        return f"{rule.ticker_symbol}: signal status is now {observed_status}"
    label = _VALUE_LABELS[rule.condition_type]
    value_str = f"{observed_value:.2f}" if observed_value is not None else "unknown"
    return f"{rule.ticker_symbol}: {label} is {rule.comparison} {rule.threshold_value:g} (observed {value_str})"


def evaluate_rules_for_symbol(
    db: Session, symbol: str, analysis: StockAnalysis, now: datetime | None = None
) -> list[AlertEvent]:
    """Evaluates every active rule on `symbol` against one fresh analysis.
    Returns the events actually fired (already committed to `db`)."""
    now = now or datetime.now(timezone.utc)
    rules = db.query(AlertRule).filter_by(ticker_symbol=symbol, is_active=True).all()
    fired: list[AlertEvent] = []

    for rule in rules:
        if rule.last_fired_at is not None and now - rule.last_fired_at < ALERT_COOLDOWN:
            continue
        met, observed_value, observed_status = _condition_met(rule, analysis, db)
        if not met:
            continue

        event = AlertEvent(
            rule_id=rule.id,
            user_id=rule.user_id,
            ticker_symbol=symbol,
            fired_at=now,
            message=_message(rule, observed_value, observed_status),
            observed_value=observed_value,
            observed_status=observed_status,
        )
        db.add(event)
        rule.last_fired_at = now
        db.add(rule)
        fired.append(event)

    if fired:
        db.commit()
        from app.services.dashboard.events import publish_dashboard_event

        for event in fired:
            publish_dashboard_event("alert.fired", {
                "id": event.id, "ticker_symbol": event.ticker_symbol, "message": event.message,
                "user_id": event.user_id,
            })
    return fired
