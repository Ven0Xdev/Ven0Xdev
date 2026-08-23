"""The recommendation dossier — every recommendation, fully argued.

Rather than reinventing analysis, the dossier is a *projection* of the
staged deliberation (services/agents) into the nine sections every
recommendation must answer. One deliberation run feeds all nine — the
dossier can never disagree with the deliberation because it IS the
deliberation, reshaped:

  why_buy · why_not_buy · biggest_risks · confidence_calculation ·
  manipulation_risk · liquidity_analysis · historical_similarities ·
  missing_information · invalidation_conditions
"""
from __future__ import annotations

from dataclasses import asdict

from sqlalchemy.orm import Session

from app.services.agents.reasoning_engine import ReasoningEngine
from app.services.data_providers.base import MarketDataProvider


def build_recommendation_dossier(
    symbol: str,
    provider: MarketDataProvider,
    db: Session | None = None,
) -> dict:
    deliberation = ReasoningEngine().deliberate(symbol, provider=provider, db=db)
    stages = {s.stage: s for s in deliberation.stages}
    verdict = deliberation.verdict
    all_evidence = [e for s in deliberation.stages for e in s.evidence]

    confidence_stage = stages["confidence"]
    risk_stage = stages["risk"]

    manipulation_items = [e for e in all_evidence if e.source.startswith("manipulation.")]
    liquidity_items = [
        e for e in all_evidence
        if "liquidity" in e.source or "illiquidity" in e.source or e.source == "risk.composite"
    ]
    memory_items = [e for e in all_evidence if e.agent == "memory_agent"]
    learning_items = [e for e in all_evidence if e.agent == "self_learning_agent"]

    # Missing information: honest gaps, harvested from the evidence record
    # plus known provider limitations — never padded, never invented.
    missing: list[str] = []
    missing.extend(e.claim for e in memory_items if e.source == "memory.no_graded_history")
    missing.extend(e.claim for e in learning_items if e.source in ("learning.insufficient_history", "learning.unavailable"))
    quote = None
    try:
        quote = provider.get_quote(symbol)
    except Exception:
        missing.append("Live quote unavailable from the active provider at dossier time.")
    if quote is not None and quote.bid is None:
        missing.append("Bid/ask depth not supplied by the active data provider — spread-based liquidity signals run in reduced-information mode.")
    if not missing:
        missing.append("No material information gaps identified for this dossier.")

    return {
        "ticker": deliberation.ticker,
        "stance": verdict.stance,
        "why_buy": verdict.key_reasons_for or ["No affirmative case was found by any analyst — absence recorded, not assumed."],
        "why_not_buy": verdict.key_reasons_against or ["No opposing case survived deliberation — see contrarian findings for what was checked."],
        "biggest_risks": [e.claim for e in risk_stage.evidence] or [verdict.key_reasons_against[0] if verdict.key_reasons_against else "Baseline market risk."],
        "confidence_calculation": {
            "conviction": verdict.conviction,
            "formula": "conviction = |net evidence| × agreement × (model confidence / 100) × calibration damping, capped at 0.97",
            "components": {
                "evidence_agreement": confidence_stage.metrics.get("agreement"),
                "model_confidence": confidence_stage.metrics.get("model_confidence"),
                "calibration_damping": confidence_stage.metrics.get("learning_damping"),
            },
            "note": "Each factor can only reduce conviction — the system cannot talk itself up.",
        },
        "manipulation_risk": {
            "findings": [e.claim for e in manipulation_items] or ["No manipulation patterns detected."],
        },
        "liquidity_analysis": {
            "findings": [e.claim for e in liquidity_items] or ["No liquidity concerns raised during deliberation."],
        },
        "historical_similarities": [e.claim for e in memory_items] or ["No experiential history available for this ticker."],
        "missing_information": missing,
        "invalidation_conditions": verdict.invalidation_conditions,
        "probabilities": {
            "up_10_within_horizon": verdict.probability_up_10,
            "downside_before_upside": verdict.probability_downside_first,
            "holding_period_days": verdict.estimated_holding_period_days,
        },
        "suggested_max_allocation_pct": verdict.suggested_max_allocation_pct,
        "narrative": verdict.narrative,
        "full_deliberation": asdict(deliberation),
    }
