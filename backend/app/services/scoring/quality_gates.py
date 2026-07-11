"""Scanner quality gates — the filter between 'analyzed' and 'opportunity'.

Every gate is a named policy with an explicit threshold, and every decision
(pass or fail) produces human-readable reasons citing the actual values.
The scanner never rejects silently and never accepts without saying why —
'explain every selection and rejection' is a data contract here, not a
UI nicety (rows land in `scan_decisions`).

Gates are deliberately conservative *rejections of the untradeable*, not
alpha judgments: a low AI score is NOT a rejection reason (a weak setup is
still information); an untradeable or un-analyzable security is.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.schemas.stock import StockAnalysis

MIN_PRICE = 0.0005            # below this, one tick is a >20% move — untradeable
MAX_MANIPULATION_RISK = 80.0  # near-certain manipulation signature
MIN_LIQUIDITY = 15.0          # exits would move the market against you
MIN_CONFIDENCE = 20.0         # model is telling us it cannot see this ticker clearly


@dataclass
class GateDecision:
    accepted: bool
    reasons: list[str]  # rejection reasons, or selection rationale when accepted


def evaluate_quality_gates(analysis: StockAnalysis) -> GateDecision:
    rejections: list[str] = []

    if analysis.current_price < MIN_PRICE:
        rejections.append(
            f"Sub-tick price (${analysis.current_price:.6f} < ${MIN_PRICE}) — a single tick is a "
            f"double-digit percentage move; effectively untradeable."
        )
    if analysis.manipulation_risk >= MAX_MANIPULATION_RISK:
        rejections.append(
            f"Manipulation risk {analysis.manipulation_risk:.0f}/100 (gate: <{MAX_MANIPULATION_RISK:.0f}) — "
            f"active flags: {', '.join(f.code for f in analysis.manipulation_flags[:4]) or 'statistical anomaly'}."
        )
    if analysis.liquidity_score < MIN_LIQUIDITY:
        rejections.append(
            f"Liquidity {analysis.liquidity_score:.0f}/100 (gate: ≥{MIN_LIQUIDITY:.0f}) — "
            f"positions could not be exited near quoted prices."
        )
    if analysis.confidence_score < MIN_CONFIDENCE:
        rejections.append(
            f"Model confidence {analysis.confidence_score:.0f}/100 (gate: ≥{MIN_CONFIDENCE:.0f}) — "
            f"insufficient data quality to trust any score on this ticker."
        )

    if rejections:
        return GateDecision(accepted=False, reasons=rejections)

    bullish = [f.label for f in analysis.top_factors if f.direction == "bullish"][:3]
    rationale = (
        f"Passed all quality gates. AI score {analysis.overall_ai_score:.0f}/100 at "
        f"{analysis.confidence_score:.0f}% confidence; manipulation risk {analysis.manipulation_risk:.0f}/100; "
        f"liquidity {analysis.liquidity_score:.0f}/100."
    )
    if bullish:
        rationale += f" Leading factors: {', '.join(bullish)}."
    return GateDecision(accepted=True, reasons=[rationale])
