"""Deterministic Risk Engine — thresholds a candidate must clear regardless
of what any scoring model or (future) AI agent recommends.

Configurable via app/core/config.py (RISK_MIN_CONFIDENCE_PCT,
RISK_MIN_REWARD_RISK_RATIO, RISK_MAX_PORTFOLIO_RISK_PER_TRADE_PCT), not
hardcoded — an operator can tighten or loosen these per deployment without
a code change. Every rejection cites its threshold and the observed value,
matching the existing quality_gates.py / signals/engine.py convention.

Distinct from services/scoring/quality_gates.py (which filters out
untradeable securities — sub-tick price, extreme manipulation risk) and
services/signals/engine.py's safety rules (data-quality/provenance gates
for the signal engine specifically): this module is the trade-level risk
check — is the model confident enough, is the reward worth the risk, and
does the proposed position size respect the portfolio risk budget.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.core.config import Settings, get_settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class RiskVerdict:
    passed: bool
    reasons: list[str] = field(default_factory=list)


def evaluate_risk(
    confidence_pct: float,
    reward_risk_ratio: float,
    position_risk_pct: float | None = None,
    settings: Settings | None = None,
    db: "Session | None" = None,
    safe_mode: bool | None = None,
) -> RiskVerdict:
    """Checks confidence and reward:risk unconditionally. `position_risk_pct`
    (the fraction of portfolio equity a proposed trade would put at risk) is
    optional — it's only known once a position size has been determined
    (execution time), so a pre-scan/shortlist call that hasn't sized a
    position yet can omit it and this check is simply skipped.

    `db`, when provided, lets Safe Mode be flipped live by an operator (see
    services/platform_settings.py) instead of only via the env-fixed
    `settings.safe_mode_enabled`. Omitting it (e.g. a unit test calling this
    directly) falls back to the env-only default — unchanged behavior.

    `safe_mode`, when provided, is used as-is and `db` is never queried —
    for callers (the scanner's per-symbol ThreadPoolExecutor) that must not
    hand the same SQLAlchemy Session to concurrent worker threads: resolve
    the flag once up front, on the main thread, and pass it down instead.
    """
    settings = settings or get_settings()
    reasons: list[str] = []

    if safe_mode is None:
        from app.services.platform_settings import is_safe_mode_active

        safe_mode = is_safe_mode_active(db, settings=settings)

    if safe_mode:
        # Absolute kill switch — short-circuits before any other check, and
        # applies regardless of how strong the setup otherwise looks.
        return RiskVerdict(
            passed=False,
            reasons=["Safe Mode is active platform-wide — no new actionable signals or trades are permitted."],
        )

    if confidence_pct < settings.risk_min_confidence_pct:
        reasons.append(
            f"Confidence {confidence_pct:.1f}% below the {settings.risk_min_confidence_pct:.1f}% minimum."
        )
    if reward_risk_ratio < settings.risk_min_reward_risk_ratio:
        reasons.append(
            f"Reward:risk {reward_risk_ratio:.2f}:1 below the "
            f"{settings.risk_min_reward_risk_ratio:.2f}:1 minimum."
        )
    if position_risk_pct is not None and position_risk_pct > settings.risk_max_portfolio_risk_per_trade_pct:
        reasons.append(
            f"Position risk {position_risk_pct:.2f}% of portfolio exceeds the "
            f"{settings.risk_max_portfolio_risk_per_trade_pct:.2f}% max risk per trade."
        )

    return RiskVerdict(passed=not reasons, reasons=reasons)
