from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, Query

from app.api.deps import data_provider
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/scan", tags=["scan"])


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

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t.symbol for t in tickers}
        for future in as_completed(futures):
            try:
                analysis = future.result()
            except Exception:
                continue
            if analysis.overall_ai_score >= min_score and analysis.manipulation_risk <= max_manipulation_risk:
                results.append(analysis)

    results.sort(key=lambda a: a.overall_ai_score, reverse=True)
    return results[:limit]


@router.get("/heatmap")
def sector_heatmap(provider: MarketDataProvider = Depends(data_provider)):
    tickers = provider.get_universe()
    sector_scores: dict[str, list[float]] = {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t for t in tickers}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                analysis = future.result()
            except Exception:
                continue
            sector_scores.setdefault(ticker.sector, []).append(analysis.overall_ai_score)

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
