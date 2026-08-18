"""The staged reasoning engine — deliberation, never instant answers.

The engine enforces the platform's reasoning discipline as *control flow*:
a verdict object cannot exist until every prior stage has executed, in
order. The stages, and what each contributes:

1. EVIDENCE        domain analysts + detective + memory gather attributable,
                   directional evidence. No conclusions are permitted here.
2. CONFIDENCE      how much should this evidence be trusted? Inter-evidence
                   agreement, model confidence, and the self-learning
                   agent's calibration-derived damping are computed.
3. CONTRADICTION   the contrarian sees the emerging consensus and is
                   obligated to attack it; its findings join the record.
4. RISK            the risk manager translates everything into loss terms
                   and writes the explicit invalidation conditions.
5. EXPLANATION     the judge assembles the narrative — the strongest case
                   for AND against, in plain language, before any verdict.
6. RECOMMENDATION  only now is the verdict composed, plus the portfolio
                   manager's sizing discipline. Conviction is capped at
                   0.97; stances are graded (avoid→favorable), never
                   buy/sell commands.

The full trace is returned, not just the conclusion — the deliberation IS
the product (auditable reasoning), the verdict is merely its last line.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.agents.analysts import FundamentalAnalyst, NewsAnalyst, SentimentAnalyst, TechnicalAnalyst
from app.services.agents.context import build_context
from app.services.agents.evidence import Deliberation, EvidenceAgent, EvidenceBundle, StageTrace
from app.services.agents.judge import JudgeAgent
from app.services.agents.memory import MemoryAgent, SelfLearningAgent
from app.services.agents.oversight import ContrarianAnalyst, ManipulationDetective, PortfolioManager, RiskManager
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider


class ReasoningEngine:
    def __init__(self) -> None:
        self.analysts: list[EvidenceAgent] = [
            TechnicalAnalyst(), FundamentalAnalyst(), SentimentAnalyst(), NewsAnalyst(),
        ]
        self.detective = ManipulationDetective()
        self.memory = MemoryAgent()
        self.learning = SelfLearningAgent()
        self.contrarian = ContrarianAnalyst()
        self.risk = RiskManager()
        self.judge = JudgeAgent()
        self.portfolio = PortfolioManager()

    def deliberate(
        self,
        symbol: str,
        provider: MarketDataProvider | None = None,
        db: Session | None = None,
    ) -> Deliberation:
        ctx = build_context(symbol, provider or get_data_provider(), db=db)
        bundle = EvidenceBundle()
        stages: list[StageTrace] = []

        # ---- Stage 1: EVIDENCE -------------------------------------------------
        evidence_agents: list[EvidenceAgent] = [*self.analysts, self.detective, self.memory]
        for agent in evidence_agents:
            bundle.add(*agent.run(ctx))
        stages.append(
            StageTrace(
                stage="evidence",
                summary=(
                    f"{len(bundle.items)} pieces of evidence gathered by "
                    f"{len(self.analysts) + 2} agents: {len(bundle.bullish())} bullish, "
                    f"{len(bundle.bearish())} bearish."
                ),
                evidence=list(bundle.items),
                metrics={"net_score": round(bundle.net_score(), 3)},
            )
        )

        # ---- Stage 2: CONFIDENCE ------------------------------------------------
        learning_evidence, damping = self.learning.run(ctx)
        bundle.add(*learning_evidence)
        agreement = bundle.agreement()
        stages.append(
            StageTrace(
                stage="confidence",
                summary=(
                    f"Evidence agreement {agreement:.0%}; model confidence "
                    f"{ctx.analysis.confidence_score:.0f}/100; calibration damping ×{damping:.2f} "
                    f"applied by the self-learning agent."
                ),
                evidence=learning_evidence,
                metrics={
                    "agreement": round(agreement, 3),
                    "model_confidence": ctx.analysis.confidence_score,
                    "learning_damping": damping,
                },
            )
        )

        # ---- Stage 3: CONTRADICTION -----------------------------------------------
        counter = self.contrarian.run(ctx, bundle)
        bundle.add(*counter)
        stages.append(
            StageTrace(
                stage="contradiction",
                summary=f"Contrarian filed {len(counter)} finding(s) against the emerging consensus; net score moved to {bundle.net_score():+.3f}.",
                evidence=counter,
                metrics={"net_score_after": round(bundle.net_score(), 3)},
            )
        )

        # ---- Stage 4: RISK ------------------------------------------------------------
        risk_evidence, risk_metrics, invalidations = self.risk.run(ctx)
        bundle.add(*risk_evidence)
        stages.append(
            StageTrace(
                stage="risk",
                summary=f"Risk level {risk_metrics['risk_level']} ({risk_metrics['composite_risk']}/100); {len(invalidations)} invalidation conditions defined.",
                evidence=risk_evidence,
                metrics=risk_metrics,
            )
        )

        # ---- Stage 5: EXPLANATION --------------------------------------------------------
        verdict = self.judge.deliberate(ctx, bundle, damping, invalidations)
        stages.append(
            StageTrace(
                stage="explanation",
                summary=verdict.narrative,
                metrics={"reasons_for": len(verdict.key_reasons_for), "reasons_against": len(verdict.key_reasons_against)},
            )
        )

        # ---- Stage 6: RECOMMENDATION ---------------------------------------------------------
        guidance = self.portfolio.position_guidance(ctx, verdict.conviction)
        stages.append(
            StageTrace(
                stage="recommendation",
                summary=(
                    f"Stance: {verdict.stance} at {verdict.conviction:.0%} conviction. "
                    f"Position ceiling {guidance['max_allocation_pct']}% of portfolio, "
                    f"horizon {guidance['holding_period_days']} trading days."
                ),
                metrics=guidance,
            )
        )

        return Deliberation(ticker=ctx.symbol, stages=stages, verdict=verdict)
