from fastapi import APIRouter

from app.api.v1.endpoints import admin, alerts, auth, backtest, billing, chat, dashboard, models, monitoring, paper_trading, portfolio, predictions, providers, scan, stocks, stream, universe, watchlist

api_router = APIRouter()
api_router.include_router(auth.router)
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
api_router.include_router(providers.router)
api_router.include_router(universe.router)
api_router.include_router(admin.router)
api_router.include_router(billing.router)
