"""Red-Team review — the platform's final veto authority before any
autonomous action (an NCS marker being treated as actionable, or an
internal paper order actually opening).

Deliberately deterministic and rule-based, NOT another LLM/agent call —
every veto cites its exact threshold and observed value (same discipline
as services/risk/engine.py's evaluate_risk and
services/signals/engine.py's apply_safety_rules), so a rejection is
always explainable and reproducible, never a black-box "no". This is a
distinct, stricter check layered on TOP of those existing gates, not a
replacement for either — a setup that already cleared RiskPolicy and the
Signal Engine's safety rules can still be vetoed here for reasons neither
of those checks makes (correlated/duplicate exposure, aggregate position
count, a stricter manipulation ceiling as defense-in-depth).

Consumed by:
- services/signals/ncs.py's NcsInputs.red_team_veto (duck-typed — NCS only
  ever reads .vetoed/.reason, so this module has zero import dependency
  in the other direction).
- The autonomous paper-trading loop (services/paper_trading/autonomous.py),
  whose entries must clear this review before opening, per the platform's
  safety-gate checklist ("Red-Team agent has final veto authority").
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.schemas.stock import StockAnalysis
from app.services.monitoring.drift import drift_status_label
from app.services.platform_settings import is_safe_mode_active

RED_TEAM_VERSION = "red-team-v1"

# Independent of (and intentionally stricter than) RiskPolicy's own
# max_manipulation_risk / min_confidence thresholds — defense-in-depth,
# not a duplicate of the same check.
MANIPULATION_VETO_THRESHOLD = 65.0
CONFIDENCE_VETO_FLOOR = 40.0
DEFAULT_MAX_OPEN_POSITIONS = 5


@dataclass
class RedTeamCheck:
    name: str
    passed: bool
    detail: str


@dataclass
class RedTeamVerdict:
    vetoed: bool
    reason: str | None
    checks: list[RedTeamCheck] = field(default_factory=list)
    version: str = RED_TEAM_VERSION


def review(
    symbol: str,
    analysis: StockAnalysis,
    db: Session | None,
    portfolio_open_symbols: set[str] | None = None,
    max_open_positions: int = DEFAULT_MAX_OPEN_POSITIONS,
    provider_healthy: bool = True,
) -> RedTeamVerdict:
    """Every check runs and is recorded regardless of outcome — the full
    `checks` list is the audit trail (spec: "Record why every [decision]
    was ... rejected"), not just the first failure short-circuiting.
    """
    checks: list[RedTeamCheck] = []

    safe_mode = is_safe_mode_active(db)
    checks.append(RedTeamCheck(
        "safe_mode", not safe_mode,
        "Safe Mode is active platform-wide — no new actionable signals or trades are permitted." if safe_mode
        else "Safe Mode is not active.",
    ))

    drift_status = drift_status_label(db) if db is not None else "insufficient_history"
    drift_critical = drift_status == "significant"
    checks.append(RedTeamCheck(
        "drift", not drift_critical,
        f"Drift status is '{drift_status}' — model/feature distributions have shifted significantly." if drift_critical
        else f"Drift status is '{drift_status}'.",
    ))

    manip_veto = analysis.manipulation_risk >= MANIPULATION_VETO_THRESHOLD
    checks.append(RedTeamCheck(
        "manipulation_risk", not manip_veto,
        f"Manipulation risk {analysis.manipulation_risk:.0f}/100 meets or exceeds the "
        f"{MANIPULATION_VETO_THRESHOLD:.0f} Red-Team ceiling." if manip_veto
        else f"Manipulation risk {analysis.manipulation_risk:.0f}/100 below the {MANIPULATION_VETO_THRESHOLD:.0f} ceiling.",
    ))

    conf_veto = analysis.confidence_score < CONFIDENCE_VETO_FLOOR
    checks.append(RedTeamCheck(
        "confidence_floor", not conf_veto,
        f"Model confidence {analysis.confidence_score:.0f}/100 below the {CONFIDENCE_VETO_FLOOR:.0f} Red-Team floor." if conf_veto
        else f"Model confidence {analysis.confidence_score:.0f}/100 meets the {CONFIDENCE_VETO_FLOOR:.0f} floor.",
    ))

    if portfolio_open_symbols is not None:
        symbol_upper = symbol.upper()
        if symbol_upper in portfolio_open_symbols:
            checks.append(RedTeamCheck(
                "duplicate_exposure", False,
                f"Already holding an open position in {symbol_upper} — no averaging up/down.",
            ))
        elif len(portfolio_open_symbols) >= max_open_positions:
            checks.append(RedTeamCheck(
                "max_open_positions", False,
                f"{len(portfolio_open_symbols)} open positions already at/above the {max_open_positions} limit.",
            ))
        else:
            checks.append(RedTeamCheck(
                "exposure", True,
                f"{len(portfolio_open_symbols)} open position(s), below the {max_open_positions} limit.",
            ))

    checks.append(RedTeamCheck(
        "provider_health", provider_healthy,
        "Market-data provider connection is stale/unhealthy." if not provider_healthy
        else "Market-data provider connection is healthy.",
    ))

    failed = [c for c in checks if not c.passed]
    vetoed = bool(failed)
    reason = "; ".join(c.detail for c in failed) if failed else None
    return RedTeamVerdict(vetoed=vetoed, reason=reason, checks=checks)
