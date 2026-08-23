from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, get_current_user
from app.core.entitlements import EntitlementExceeded, enforce_limit
from app.db.models.alert import COMPARISONS, CONDITION_TYPES, AlertEvent, AlertRule
from app.db.models.user import User
from app.schemas.alert import AlertEventOut, AlertRuleCreate, AlertRuleOut
from app.services.universe.manager import get_active_universe

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _validate(payload: AlertRuleCreate, db: Session) -> None:
    if payload.condition_type not in CONDITION_TYPES:
        raise HTTPException(status_code=400, detail=f"condition_type must be one of {CONDITION_TYPES}")
    if payload.comparison not in COMPARISONS:
        raise HTTPException(status_code=400, detail=f"comparison must be one of {COMPARISONS}")
    if payload.condition_type == "signal_status":
        if not payload.target_status:
            raise HTTPException(status_code=400, detail="target_status is required for a signal_status condition")
    elif payload.threshold_value is None:
        raise HTTPException(status_code=400, detail=f"threshold_value is required for a {payload.condition_type} condition")

    # Automatic evaluation (workers/prediction_scheduler.py) only ever
    # visits the Asset Universe Manager's active universe — a rule on any
    # other symbol would silently never fire, with no feedback telling the
    # user why. Refusing at creation time is the honest alternative to a
    # rule that quietly does nothing forever.
    tracked = {a.symbol for a in get_active_universe(db)}
    if payload.ticker_symbol.upper() not in tracked:
        raise HTTPException(
            status_code=400,
            detail=f"{payload.ticker_symbol.upper()} is not in the tracked asset universe — alerts can only be "
            "set on tickers the platform actively analyzes (see GET /api/v1/universe).",
        )


@router.get("/rules", response_model=list[AlertRuleOut])
def list_rules(db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    return db.query(AlertRule).filter_by(user_id=user.id).order_by(AlertRule.created_at.desc()).all()


@router.post("/rules", response_model=AlertRuleOut)
def create_rule(
    payload: AlertRuleCreate,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    _validate(payload, db)

    current_count = db.query(AlertRule).filter_by(user_id=user.id).count()
    try:
        enforce_limit(user.plan, "max_alert_rules", current_count, "alert rules")
    except EntitlementExceeded as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    rule = AlertRule(
        user_id=user.id,
        ticker_symbol=payload.ticker_symbol.upper(),
        condition_type=payload.condition_type,
        comparison="equals" if payload.condition_type == "signal_status" else payload.comparison,
        threshold_value=payload.threshold_value,
        target_status=payload.target_status,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=AlertRuleOut)
def set_rule_active(
    rule_id: int,
    is_active: bool,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    rule = db.query(AlertRule).filter_by(id=rule_id, user_id=user.id).one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    rule.is_active = is_active
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    rule = db.query(AlertRule).filter_by(id=rule_id, user_id=user.id).one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "deleted"}


@router.get("/events", response_model=list[AlertEventOut])
def list_events(
    unacknowledged_only: bool = False,
    limit: int = 50,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    query = db.query(AlertEvent).filter_by(user_id=user.id)
    if unacknowledged_only:
        query = query.filter_by(acknowledged=False)
    return query.order_by(AlertEvent.fired_at.desc()).limit(limit).all()


@router.post("/events/{event_id}/acknowledge", response_model=AlertEventOut)
def acknowledge_event(event_id: int, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    event = db.query(AlertEvent).filter_by(id=event_id, user_id=user.id).one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Alert event not found")
    event.acknowledged = True
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
