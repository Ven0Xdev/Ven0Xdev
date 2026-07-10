from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session
from app.db.models.portfolio import PortfolioPosition, WatchlistItem
from app.db.models.prediction import Prediction
from app.services.data_providers.base import MarketDataProvider
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
):
    tickers = provider.get_universe()
    analyses = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(analyze_ticker, t.symbol, provider) for t in tickers]
        for future in as_completed(futures):
            try:
                analyses.append(future.result())
            except Exception:
                continue

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
