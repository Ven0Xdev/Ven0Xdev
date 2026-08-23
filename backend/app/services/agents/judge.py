"""Judge agent — the only agent allowed to conclude.

Receives the complete deliberation material (all evidence including the
contrarian's attack, the risk assessment, and the learning agent's damping
factor) and composes the verdict. Its constraints are structural:

- It cannot run before every prior stage has contributed (enforced by the
  reasoning engine's stage order).
- Conviction is multiplicative in agreement, model confidence, and the
  learning damping — it can only be *earned down*, never asserted up —
  and is hard-capped at 0.97 (never certainty, principle P1).
- Every verdict carries its strongest opposing reasons verbatim. A verdict
  that cannot cite the case against itself is invalid by construction.
"""
from __future__ import annotations

from app.services.agents.context import DeliberationContext
from app.services.agents.evidence import EvidenceBundle, Verdict

_STANCES = [  # (minimum net score, stance)
    (0.35, "favorable"),
    (0.15, "constructive"),
    (-0.15, "neutral"),
    (-0.35, "cautious"),
    (-1.01, "avoid"),
]

CONVICTION_CAP = 0.97


class JudgeAgent:
    name = "judge"

    def deliberate(
        self,
        ctx: DeliberationContext,
        bundle: EvidenceBundle,
        damping: float,
        invalidations: list[str],
    ) -> Verdict:
        net = bundle.net_score()
        agreement = bundle.agreement()
        analysis = ctx.analysis

        stance = next(s for threshold, s in _STANCES if net >= threshold)

        # Manipulation override: no amount of bullish evidence upgrades a
        # heavily flagged ticker past "cautious" — the detective holds a veto.
        if analysis.manipulation_risk >= 70 and stance in ("favorable", "constructive", "neutral"):
            stance = "cautious"

        conviction = min(
            abs(net) * agreement * (analysis.confidence_score / 100) * damping,
            CONVICTION_CAP,
        )

        primary = next(
            (p for p in analysis.probability_matrix if p.horizon_days == analysis.estimated_holding_period_days),
            analysis.probability_matrix[0],
        )

        reasons_for = [e.claim for e in sorted(bundle.bullish(), key=lambda e: -e.strength)[:4]]
        reasons_against = [e.claim for e in sorted(bundle.bearish(), key=lambda e: -e.strength)[:4]]

        narrative = self._narrative(ctx, stance, conviction, primary.prob_up_10, reasons_for, reasons_against)

        return Verdict(
            stance=stance,
            conviction=round(conviction, 3),
            probability_up_10=primary.prob_up_10,
            probability_downside_first=analysis.probability_downside_before_upside,
            key_reasons_for=reasons_for,
            key_reasons_against=reasons_against,
            invalidation_conditions=invalidations,
            suggested_max_allocation_pct=analysis.max_allocation_pct,
            estimated_holding_period_days=analysis.estimated_holding_period_days,
            narrative=narrative,
        )

    @staticmethod
    def _narrative(ctx, stance, conviction, p10, reasons_for, reasons_against) -> str:
        parts = [
            f"After full deliberation, the panel's stance on {ctx.symbol} is **{stance}** "
            f"at {conviction:.0%} conviction, with a modeled {p10:.0%} probability of touching +10% "
            f"within {ctx.analysis.estimated_holding_period_days} trading days."
        ]
        if reasons_for:
            parts.append("Strongest case for: " + reasons_for[0])
        if reasons_against:
            parts.append("Strongest case against: " + reasons_against[0])
        parts.append(
            "This is a probability-weighted research verdict, not a trade instruction — "
            "the platform never claims certainty about future prices."
        )
        return " ".join(parts)
