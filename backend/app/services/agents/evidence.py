"""Evidence model — the currency every agent trades in.

An agent never outputs a conclusion; it outputs *evidence*: an attributable,
directional, strength-weighted claim tied to a named source. Conclusions are
the Judge's monopoly, and only after every stage of the deliberation has
run. This is what makes the reasoning engine auditable: the final verdict
can always be decomposed back into who said what and why.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from app.services.agents.context import DeliberationContext

BULLISH = "bullish"
BEARISH = "bearish"
NEUTRAL = "neutral"

_SIGN = {BULLISH: 1.0, BEARISH: -1.0, NEUTRAL: 0.0}


@dataclass
class Evidence:
    agent: str          # which agent produced it
    claim: str          # human-readable statement
    direction: str      # bullish | bearish | neutral
    strength: float     # 0..1 — how much weight the agent assigns
    source: str         # machine-locatable origin, e.g. "technical.rsi_14"
    value: float | None = None

    @property
    def signed_strength(self) -> float:
        return _SIGN[self.direction] * self.strength


class EvidenceAgent(Protocol):
    """Structural contract shared by every Stage-1 evidence gatherer
    (the four analysts, the manipulation detective, and the memory
    agent — see reasoning_engine.py) so they can be driven from one
    homogeneous list despite having no common declared base class."""

    def run(self, ctx: DeliberationContext) -> list[Evidence]: ...


@dataclass
class EvidenceBundle:
    items: list[Evidence] = field(default_factory=list)

    def add(self, *evidence: Evidence) -> None:
        self.items.extend(evidence)

    def bullish(self) -> list[Evidence]:
        return [e for e in self.items if e.direction == BULLISH]

    def bearish(self) -> list[Evidence]:
        return [e for e in self.items if e.direction == BEARISH]

    def net_score(self) -> float:
        """Strength-weighted net direction in [-1, 1]."""
        total = sum(e.strength for e in self.items if e.direction != NEUTRAL)
        if total == 0:
            return 0.0
        return sum(e.signed_strength for e in self.items) / total

    def agreement(self) -> float:
        """1 = all directional evidence points one way; 0 = perfectly split."""
        bull = sum(e.strength for e in self.bullish())
        bear = sum(e.strength for e in self.bearish())
        total = bull + bear
        if total == 0:
            return 0.5
        return abs(bull - bear) / total


@dataclass
class StageTrace:
    stage: str          # evidence | confidence | contradiction | risk | explanation | recommendation
    summary: str
    evidence: list[Evidence] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


@dataclass
class Verdict:
    stance: str                     # avoid | cautious | neutral | constructive | favorable
    conviction: float               # 0..0.97 — never certainty
    probability_up_10: float        # calibrated P(+10%) at primary horizon
    probability_downside_first: float
    key_reasons_for: list[str]
    key_reasons_against: list[str]
    invalidation_conditions: list[str]
    suggested_max_allocation_pct: float
    estimated_holding_period_days: int
    narrative: str


@dataclass
class Deliberation:
    ticker: str
    stages: list[StageTrace]
    verdict: Verdict
