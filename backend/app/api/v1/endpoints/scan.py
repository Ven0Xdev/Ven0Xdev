from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, expensive_rate_limit, require_operator
from app.db.models.scan import ScanCycle, ScanDecision
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.scanner.multi_asset import DEFAULT_SHORTLIST_SIZE, run_multi_asset_prescan
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/scan", tags=["scan"])


@router.get("/multi-asset/prescan")
def multi_asset_prescan(
    shortlist_size: int = Query(DEFAULT_SHORTLIST_SIZE, ge=1, le=20),
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    _user=Depends(expensive_rate_limit),
):
    """Stage 1+2 of the deterministic multi-asset scanner (spec: "two-stage
    scanning pipeline"): every active asset in the Asset Universe Manager
    (`GET /api/v1/universe`) is scored and passed through the quality gates
    + deterministic risk engine, then the top-scoring survivors become the
    shortlist. Distinct from `/scan/opportunities` above, which scans the
    OTC-only provider universe unchanged.

    The shortlist is the handoff point for a future AI agent committee to
    take over for deeper analysis (not yet built) — today it is the
    scanner's final deterministic output.
    """
    result = run_multi_asset_prescan(db, provider, shortlist_size=shortlist_size)
    return {
        "universe_size": result.universe_size,
        "analyzed": result.analyzed,
        "shortlist": [
            {
                "symbol": c.symbol,
                "asset_type": c.asset_type,
                "overall_ai_score": c.overall_ai_score,
                "confidence_score": c.confidence_score,
            }
            for c in result.shortlist
        ],
        "candidates": [
            {
                "symbol": c.symbol,
                "asset_type": c.asset_type,
                "decision": c.decision,
                "overall_ai_score": c.overall_ai_score,
                "confidence_score": c.confidence_score,
                "reasons": c.reasons,
            }
            for c in result.all_candidates
        ],
    }


@router.post("/run-cycle")
def run_cycle_now(
    provider: MarketDataProvider = Depends(data_provider),
    db: Session = Depends(db_session),
    _operator=Depends(require_operator),
):
    """Trigger one full scanner cycle on demand (normally the background
    worker runs these continuously)."""
    from app.workers.scan_scheduler import run_scan_cycle

    analyzed = run_scan_cycle(provider=provider, db=db)
    latest = db.query(ScanCycle).order_by(ScanCycle.id.desc()).first()
    return {
        "analyzed": analyzed,
        "cycle_id": latest.id if latest else None,
        "accepted": latest.accepted_count if latest else 0,
        "rejected": latest.rejected_count if latest else 0,
        "failed": latest.failed_count if latest else 0,
    }


@router.get("/cycles")
def scan_history(limit: int = Query(20, le=100), db: Session = Depends(db_session)):
    """Scanner history: every completed cycle with its accept/reject split."""
    cycles = db.query(ScanCycle).order_by(ScanCycle.started_at.desc()).limit(limit).all()
    return [
        {
            "cycle_id": c.id,
            "started_at": c.started_at,
            "finished_at": c.finished_at,
            "provider": c.provider_name,
            "universe_size": c.universe_size,
            "accepted": c.accepted_count,
            "rejected": c.rejected_count,
            "failed": c.failed_count,
        }
        for c in cycles
    ]


@router.get("/cycles/{cycle_id}/decisions")
def cycle_decisions(
    cycle_id: int,
    decision: str | None = Query(None, pattern="^(accepted|rejected|failed)$"),
    db: Session = Depends(db_session),
):
    """Why every stock was selected or rejected in a specific cycle."""
    if db.query(ScanCycle).filter_by(id=cycle_id).one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Scan cycle {cycle_id} not found")
    query = db.query(ScanDecision).filter_by(cycle_id=cycle_id)
    if decision:
        query = query.filter_by(decision=decision)
    rows = query.order_by(ScanDecision.rank.isnot(None).desc(), ScanDecision.rank).all()
    return [
        {
            "ticker": r.ticker_symbol,
            "decision": r.decision,
            "rank": r.rank,
            "ai_score": r.ai_score,
            "confidence": r.confidence,
            "manipulation_risk": r.manipulation_risk,
            "reasons": r.reasons,
        }
        for r in rows
    ]


@router.get("/opportunities", response_model=list[StockAnalysis])
def top_opportunities(
    limit: int = Query(20, le=100),
    min_score: float = Query(0, ge=0, le=100),
    max_manipulation_risk: float = Query(100, ge=0, le=100),
    provider: MarketDataProvider = Depends(data_provider),
):
    """Scan the full OTC universe, score every ticker, and return the
    top-ranked opportunities by overall AI score, filtered by risk gates.
    """
    tickers = provider.get_universe()
    results: list[StockAnalysis] = []

    provider_error: ProviderDataUnavailable | None = None
    analyzed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t.symbol for t in tickers}
        for future in as_completed(futures):
            try:
                analysis = future.result()
            except ProviderDataUnavailable as exc:
                provider_error = exc
                continue
            except Exception:
                continue
            analyzed += 1
            if analysis.overall_ai_score >= min_score and analysis.manipulation_risk <= max_manipulation_risk:
                results.append(analysis)
    if tickers and analyzed == 0 and provider_error is not None:
        raise provider_error

    results.sort(key=lambda a: a.overall_ai_score, reverse=True)
    return results[:limit]


@router.get("/heatmap")
def sector_heatmap(provider: MarketDataProvider = Depends(data_provider)):
    tickers = provider.get_universe()
    sector_scores: dict[str, list[float]] = {}

    provider_error: ProviderDataUnavailable | None = None
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t for t in tickers}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                analysis = future.result()
            except ProviderDataUnavailable as exc:
                provider_error = exc
                continue
            except Exception:
                continue
            sector_scores.setdefault(ticker.sector, []).append(analysis.overall_ai_score)
    if tickers and not sector_scores and provider_error is not None:
        raise provider_error

    return [
        {"sector": sector, "avg_score": sum(scores) / len(scores), "count": len(scores)}
        for sector, scores in sorted(sector_scores.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    ]


@router.get("/risk-monitor")
def risk_monitor(provider: MarketDataProvider = Depends(data_provider)):
    tickers = provider.get_universe()
    flagged = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t for t in tickers}
        for future in as_completed(futures):
            try:
                analysis = future.result()
            except Exception:
                continue
            if analysis.manipulation_risk >= 50:
                flagged.append(
                    {
                        "ticker": analysis.ticker,
                        "manipulation_risk": analysis.manipulation_risk,
                        "top_flags": [f.reason for f in analysis.manipulation_flags[:3]],
                    }
                )

    flagged.sort(key=lambda x: -x["manipulation_risk"])
    return flagged
