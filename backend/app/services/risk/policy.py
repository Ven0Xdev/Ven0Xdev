"""RiskPolicy — a versioned bundle of every threshold that gates whether a
setup is safe/strong enough to act on, read identically by the scanner
(services/scanner/multi_asset.py, via services/risk/engine.py's
evaluate_risk) and the per-ticker Signal Engine
(services/signals/engine.py). Before this module existed, signals/
engine.py kept its own separate hardcoded copies of the spread/liquidity/
dollar-volume/manipulation/confidence-floor numbers — this is what
replaces that, and what gives every persisted Signal a `risk_policy_version`
to record exactly which set of thresholds evaluated it (see
db/models/signal.py, migration for the new column).

Distinct from services/scoring/quality_gates.py, which stays a separate,
deliberately looser "is this security even worth analyzing at all" filter
(sub-tick price, near-certain manipulation) run only by the scanner —
RiskPolicy is the stricter, shared "is this specific setup/signal
trustworthy and worth acting on" bar.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import Settings, get_settings

# Bump this whenever a threshold's *meaning* changes (not just its value —
# a value change under an unchanged definition is just a config edit).
# Persisted on every Signal so historical signals stay attributable to the
# policy that actually evaluated them, even after this changes later.
POLICY_VERSION = "risk-policy-v1"


@dataclass(frozen=True)
class RiskPolicy:
    version: str
    min_confidence_pct: float
    min_reward_risk_ratio: float
    max_position_risk_pct: float
    min_signal_confidence_pct: float
    max_spread_pct: float
    min_liquidity_score: float
    min_dollar_volume: float
    max_manipulation_risk: float
    min_bars_for_signal: int
    safe_mode: bool

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "RiskPolicy":
        settings = settings or get_settings()
        return cls(
            version=POLICY_VERSION,
            min_confidence_pct=settings.risk_min_confidence_pct,
            min_reward_risk_ratio=settings.risk_min_reward_risk_ratio,
            max_position_risk_pct=settings.risk_max_portfolio_risk_per_trade_pct,
            min_signal_confidence_pct=settings.risk_min_signal_confidence_pct,
            max_spread_pct=settings.risk_max_spread_pct,
            min_liquidity_score=settings.risk_min_liquidity_score,
            min_dollar_volume=settings.risk_min_dollar_volume,
            max_manipulation_risk=settings.risk_max_manipulation_risk,
            min_bars_for_signal=settings.risk_min_bars_for_signal,
            safe_mode=settings.safe_mode_enabled,
        )
