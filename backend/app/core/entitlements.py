"""Plan-based usage limits — Phase 13, commercial beta readiness.

Distinct from app/core/ratelimit.py's token-bucket request-rate limiting
(how *fast* you can call an endpoint): this is a resource quota (how *many*
rows you may own at once), checked by counting a user's own existing rows
at creation time rather than tracking a separate usage counter — no new
tracking table, no drift between "what's counted" and "what actually
exists."

Only two resources are gated for this beta: watchlist items and alert
rules. Paper trading is already bounded by cash balance; backtests are
already gated by expensive_rate_limit (a request-rate limit, not a quota)
— adding a redundant quota mechanism there would be scope without benefit.
"""
from __future__ import annotations

PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free": {"max_watchlist_items": 10, "max_alert_rules": 5},
    "pro": {"max_watchlist_items": 200, "max_alert_rules": 100},
}
VALID_PLANS = tuple(PLAN_LIMITS)
DEFAULT_PLAN = "free"


class EntitlementExceeded(Exception):
    """Raised when a plan's quota for a resource would be exceeded."""


def limit_for(plan: str, key: str) -> int:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[DEFAULT_PLAN])[key]


def enforce_limit(plan: str, key: str, current_count: int, resource_label: str) -> None:
    limit = limit_for(plan, key)
    if current_count >= limit:
        raise EntitlementExceeded(
            f"Your {plan} plan allows up to {limit} {resource_label}. "
            f"You have {current_count}. Contact us to upgrade your plan."
        )
