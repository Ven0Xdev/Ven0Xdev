from fastapi import APIRouter

from app.api.v1.endpoints import auth, backtest, chat, dashboard, models, monitoring, portfolio, predictions, scan, stocks, watchlist

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
api_router.include_router(dashboard.router)
api_router.include_router(monitoring.router)
