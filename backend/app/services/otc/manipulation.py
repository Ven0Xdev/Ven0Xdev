"""OTC/micro-cap-specific manipulation checks — disabled by default.

These flags target patterns that are common (and usually diagnostic) for
thinly-traded OTC/penny stocks specifically: toxic convertible financing,
recurring reverse splits used to reset share price ahead of further
dilution, and paid promotional coverage. For mainstream large-cap
stocks/ETFs these signals are essentially always inactive (a NASDAQ/NYSE
blue-chip rarely reverse-splits or runs a promotional-newsletter campaign),
so they add noise without value to the main platform's manipulation score
and were split out of `services/features/manipulation.py`'s
`assess_manipulation_risk` (which keeps the general-purpose flags: pump-
and-dump pattern, wash-trading heuristic, abnormal spread, filing quality/
going-concern, and low-liquidity traps — all of which are meaningful for
any asset class).

Only reachable when `Settings.otc_module_enabled` is true (see
services/otc/__init__.py for the module's overall scope); not wired into
the default scoring pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.services.data_providers.base import Fundamentals, NewsArticle, TickerMeta
from app.services.features.manipulation import ManipulationFlag


@dataclass
class OtcManipulationAssessment:
    score: float  # 0-100, higher = more risk
    flags: list[ManipulationFlag] = field(default_factory=list)

    @property
    def top_reasons(self) -> list[str]:
        return [f.reason for f in sorted(self.flags, key=lambda f: -f.severity)[:5]]


def dilution_flag(fund: Fundamentals) -> ManipulationFlag | None:
    if fund.dilution_12m_pct > 50:
        return ManipulationFlag(
            code="toxic_dilution",
            severity=min(90, fund.dilution_12m_pct * 0.8),
            reason=(
                f"Share count grew {fund.dilution_12m_pct:.0f}% over the trailing 12 months — heavy dilution, "
                "possibly toxic convertible financing."
            ),
        )
    if fund.dilution_12m_pct > 20:
        return ManipulationFlag(
            code="elevated_dilution",
            severity=min(50, fund.dilution_12m_pct),
            reason=f"Share count grew {fund.dilution_12m_pct:.0f}% over the trailing 12 months.",
        )
    return None


def reverse_split_flag(meta: TickerMeta) -> ManipulationFlag | None:
    if meta.reverse_split_count_3y >= 2:
        return ManipulationFlag(
            code="repeated_reverse_splits",
            severity=min(85, 30 + meta.reverse_split_count_3y * 20),
            reason=(
                f"{meta.reverse_split_count_3y} reverse splits in the last 3 years — a recurring pattern often "
                "used to reset share price ahead of further dilution."
            ),
        )
    return None


def promotional_news_flag(news: list[NewsArticle]) -> ManipulationFlag | None:
    if not news:
        return None
    promo = [n for n in news if n.is_promotional]
    ratio = len(promo) / len(news)
    if ratio >= 0.4:
        return ManipulationFlag(
            code="promotional_campaign",
            severity=min(75, ratio * 100),
            reason=(
                f"{len(promo)} of {len(news)} recent articles look like paid stock-promotion content rather "
                "than independent reporting."
            ),
        )
    return None


def assess_otc_specific_risk(
    fundamentals: Fundamentals,
    meta: TickerMeta,
    news: list[NewsArticle],
) -> OtcManipulationAssessment:
    """Combine only the OTC-specific flags. Callers that want the full
    picture for an OTC symbol should merge this with
    `features.manipulation.assess_manipulation_risk`'s general assessment."""
    flags = [
        dilution_flag(fundamentals),
        reverse_split_flag(meta),
        promotional_news_flag(news),
    ]
    active = [f for f in flags if f is not None]
    if not active:
        return OtcManipulationAssessment(score=0.0, flags=[])

    severities = np.array([f.severity for f in active])
    combined = 1 - np.prod(1 - severities / 100)
    score = float(np.clip(combined * 100, 0, 100))
    return OtcManipulationAssessment(score=score, flags=active)
