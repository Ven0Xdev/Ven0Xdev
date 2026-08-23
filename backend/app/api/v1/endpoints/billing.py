from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session, get_current_user
from app.api.v1.endpoints.watchlist import _owned as _owned_watchlist
from app.core.entitlements import PLAN_LIMITS, limit_for
from app.db.models.alert import AlertRule
from app.db.models.portfolio import WatchlistItem
from app.db.models.user import User
from app.schemas.billing import BillingStatusOut, PlanCatalogOut, UsageOut
from app.services.billing.provider import get_billing_provider

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=PlanCatalogOut)
def list_plans():
    return PlanCatalogOut(plans=PLAN_LIMITS)


@router.get("/status", response_model=BillingStatusOut)
def billing_status(db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    watchlist_count = _owned_watchlist(db.query(WatchlistItem), user).count()
    alert_rule_count = db.query(AlertRule).filter_by(user_id=user.id).count()
    provider_status = get_billing_provider().status()
    return BillingStatusOut(
        plan=user.plan,
        usage=UsageOut(
            watchlist_items=watchlist_count,
            max_watchlist_items=limit_for(user.plan, "max_watchlist_items"),
            alert_rules=alert_rule_count,
            max_alert_rules=limit_for(user.plan, "max_alert_rules"),
        ),
        billing_configured=provider_status["configured"],
        billing_message=provider_status["message"],
    )
