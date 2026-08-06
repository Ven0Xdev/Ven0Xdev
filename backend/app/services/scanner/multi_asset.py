"""Two-stage deterministic scanner over the Asset Universe Manager's active
universe (distinct from the OTC-only endpoints in api/v1/endpoints/scan.py,
which still run over MockOTCProvider's own 30-ticker universe — see
services/universe/manager.py's module docstring for why the two stay
separate for now).

Stage 1 (pre-scan): every active asset is scored via the existing scoring
pipeline (services/scoring/scorer.analyze_ticker) and passed through the
existing quality gates (services/scoring/quality_gates — untradeable-security
filters) plus the deterministic risk engine (services/risk/engine —
confidence and reward:risk; position-sizing isn't known yet at this stage,
so that check is skipped here). Every rejection is recorded with reasons,
never silent; one symbol's analysis failure never sinks the whole scan.

Stage 2 (shortlist): candidates that passed stage 1 are ranked by overall AI
score and the top N become the shortlist. This is the handoff point for a
future AI agent committee to take over for deeper, qualitative analysis
(spec's six-agent committee — not yet built); today the shortlist itself is
the scanner's final deterministic output.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.db.models.asset import Asset
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.risk.engine import evaluate_risk
from app.services.scoring.quality_gates import evaluate_quality_gates
from app.services.scoring.scorer import analyze_ticker
from app.services.universe.manager import get_active_universe

DEFAULT_SHORTLIST_SIZE = 5


@dataclass
class PrescanCandidate:
    symbol: str
    asset_type: str
    decision: str  # "shortlisted" | "rejected" | "failed"
    overall_ai_score: float | None
    confidence_score: float | None
    reasons: list[str] = field(default_factory=list)


@dataclass
class PrescanResult:
    universe_size: int
    analyzed: int
    shortlist: list[PrescanCandidate]
    all_candidates: list[PrescanCandidate]


def _score_one(asset: Asset, provider: MarketDataProvider) -> PrescanCandidate:
    try:
        analysis = analyze_ticker(asset.symbol, provider)
    except ProviderDataUnavailable as exc:
        return PrescanCandidate(
            symbol=asset.symbol,
            asset_type=asset.asset_type,
            decision="failed",
            overall_ai_score=None,
            confidence_score=None,
            reasons=[f"Provider data unavailable: {exc}"],
        )
    except Exception as exc:  # noqa: BLE001 — one bad symbol must never sink the whole scan
        return PrescanCandidate(
            symbol=asset.symbol,
            asset_type=asset.asset_type,
            decision="failed",
            overall_ai_score=None,
            confidence_score=None,
            reasons=[f"Analysis failed: {type(exc).__name__}: {exc}"],
        )

    gate = evaluate_quality_gates(analysis)
    risk = evaluate_risk(analysis.confidence_score, analysis.expected_risk_reward)
    passed = gate.accepted and risk.passed
    return PrescanCandidate(
        symbol=asset.symbol,
        asset_type=asset.asset_type,
        decision="passed" if passed else "rejected",
        overall_ai_score=analysis.overall_ai_score,
        confidence_score=analysis.confidence_score,
        reasons=[] if passed else [*gate.reasons, *risk.reasons],
    )


def run_multi_asset_prescan(
    db: Session,
    provider: MarketDataProvider,
    shortlist_size: int = DEFAULT_SHORTLIST_SIZE,
    max_workers: int = 8,
) -> PrescanResult:
    assets: list[Asset] = get_active_universe(db)
    candidates: list[PrescanCandidate] = []

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(_score_one, asset, provider) for asset in assets]
        for future in as_completed(futures):
            candidates.append(future.result())

    analyzed = sum(1 for c in candidates if c.decision != "failed")
    passed = [c for c in candidates if c.decision == "passed"]
    passed.sort(key=lambda c: c.overall_ai_score or 0.0, reverse=True)
    shortlist = passed[:shortlist_size]
    for c in shortlist:
        c.decision = "shortlisted"

    candidates.sort(key=lambda c: c.overall_ai_score if c.overall_ai_score is not None else -1.0, reverse=True)
    return PrescanResult(
        universe_size=len(assets),
        analyzed=analyzed,
        shortlist=shortlist,
        all_candidates=candidates,
    )
