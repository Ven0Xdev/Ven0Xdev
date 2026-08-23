from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    alerts,
    auth,
    backtest,
    billing,
    chart_drawings,
    chat,
    dashboard,
    models,
    monitoring,
    news,
    paper_trading,
    portfolio,
    predictions,
    providers,
    research,
    scan,
    shadow,
    stocks,
    stream,
    universe,
    watchlist,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chart_drawings.router)
api_router.include_router(stocks.router)
api_router.include_router(scan.router)
api_router.include_router(predictions.router)
api_router.include_router(models.router)
api_router.include_router(backtest.router)
api_router.include_router(chat.router)
api_router.include_router(watchlist.router)
api_router.include_router(portfolio.router)
api_router.include_router(paper_trading.router)
api_router.include_router(alerts.router)
api_router.include_router(dashboard.router)
api_router.include_router(monitoring.router)
api_router.include_router(stream.router)
api_router.include_router(news.router)
api_router.include_router(shadow.router)
api_router.include_router(providers.router)
api_router.include_router(universe.router)
api_router.include_router(research.router)
api_router.include_router(admin.router)
api_router.include_router(billing.router)
