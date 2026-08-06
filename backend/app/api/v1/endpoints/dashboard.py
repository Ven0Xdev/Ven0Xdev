from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session
from app.db.models.portfolio import PortfolioPosition, WatchlistItem
from app.db.models.prediction import Prediction
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.market_overview import get_market_overview
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/market-overview")
def market_overview(
    symbols: str | None = None,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
):
    """Quote-level snapshot for the Asset Universe Manager's active assets
    (`GET /api/v1/universe`) — separate from the OTC scanner's universe (see
    services/market_overview.py's module docstring). Always returns 200
    with one entry per symbol; a symbol the real provider can't serve
    still gets a clearly labeled synthetic fallback entry rather than
    breaking the whole response — the dashboard should never be stuck on
    a skeleton because one vendor call failed.
    """
    from datetime import datetime, timezone

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else None
    stocks = get_market_overview(provider, db, symbol_list)
    return {
        "stocks": stocks,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "provider": provider.name,
    }


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
):
    tickers = provider.get_universe()
    analyses = []
    provider_error: ProviderDataUnavailable | None = None
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(analyze_ticker, t.symbol, provider) for t in tickers]
        for future in as_completed(futures):
            try:
                analyses.append(future.result())
            except ProviderDataUnavailable as exc:
                provider_error = exc
            except Exception:
                continue
    if tickers and not analyses and provider_error is not None:
        raise provider_error  # every ticker failed on the vendor — degraded, not "empty"

    analyses.sort(key=lambda a: a.overall_ai_score, reverse=True)
    top_opportunities = analyses[:5]
    high_risk = sorted([a for a in analyses if a.manipulation_risk >= 50], key=lambda a: -a.manipulation_risk)[:5]

    watchlist_count = db.query(WatchlistItem).count()
    open_positions = db.query(PortfolioPosition).filter_by(status="open").count()
    total_predictions = db.query(Prediction).count()

    avg_confidence = sum(a.confidence_score for a in analyses) / len(analyses) if analyses else 0.0

    return {
        "universe_size": len(tickers),
        "avg_model_confidence": round(avg_confidence, 1),
        "watchlist_count": watchlist_count,
        "open_positions": open_positions,
        "total_predictions_logged": total_predictions,
        "top_opportunities": [
            {"ticker": a.ticker, "overall_ai_score": a.overall_ai_score, "confidence_score": a.confidence_score}
            for a in top_opportunities
        ],
        "high_risk_watch": [
            {"ticker": a.ticker, "manipulation_risk": a.manipulation_risk} for a in high_risk
        ],
    }
