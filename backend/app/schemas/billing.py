from pydantic import BaseModel


class UsageOut(BaseModel):
    watchlist_items: int
    max_watchlist_items: int
    alert_rules: int
    max_alert_rules: int


class BillingStatusOut(BaseModel):
    plan: str
    usage: UsageOut
    billing_configured: bool
    billing_message: str


class PlanCatalogOut(BaseModel):
    plans: dict[str, dict[str, int]]
