from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, get_current_user
from app.db.models.paper_trading import PaperPosition, PaperTradingAccount
from app.db.models.user import User
from app.schemas.paper_trading import (
    PaperAccountOut,
    PaperOpenRequest,
    PaperPositionOut,
    PaperSimulationSummary,
    PaperStartSimulationRequest,
)
from app.services.data_providers.base import MarketDataProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import PaperTradingError

router = APIRouter(prefix="/paper-trading", tags=["paper-trading"])


def _with_mark_to_market(position: PaperPosition, provider: MarketDataProvider) -> PaperPositionOut:
    out = PaperPositionOut.model_validate(position)
    if position.status != "open":
        return out
    try:
        quote = provider.get_quote(position.ticker_symbol)
    except Exception:  # noqa: BLE001 — a quote failure must never break the positions list
        return out
    out.current_price = quote.last
    out.unrealized_pnl_dollars = (quote.last - position.avg_entry_price) * position.quantity
    out.unrealized_pnl_pct = (quote.last / position.avg_entry_price - 1) * 100 if position.avg_entry_price else None
    return out


def _account_out(account: PaperTradingAccount, db: Session, provider: MarketDataProvider) -> PaperAccountOut:
    out = PaperAccountOut.model_validate(account)
    market_value = 0.0
    for position in engine.list_open_positions_for_account(account, db):
        try:
            market_value += provider.get_quote(position.ticker_symbol).last * position.quantity
        except Exception:  # noqa: BLE001 — one bad quote must never break the whole account summary
            market_value += position.avg_entry_price * position.quantity
    out.equity = account.cash_balance + market_value
    out.unrealized_pnl_dollars = out.equity - account.starting_balance
    return out


@router.get("/account", response_model=PaperAccountOut | None)
def get_account(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """Null when the user has never started a paper simulation — the
    frontend renders the "Start New Simulation" panel in that state,
    never a fabricated zero-balance account."""
    account = engine.get_active_account(user.id, db)
    return _account_out(account, db, provider) if account is not None else None


@router.get("/simulations", response_model=list[PaperSimulationSummary])
def list_simulations(db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    summaries = []
    for account in engine.list_simulations(user.id, db):
        closed = db.query(PaperPosition).filter_by(account_id=account.id, status="closed").all()
        realized = sum(p.realized_pnl_dollars or 0.0 for p in closed)
        wins = sum(1 for p in closed if (p.realized_pnl_dollars or 0.0) > 0)
        summaries.append(
            PaperSimulationSummary(
                id=account.id,
                simulation_number=account.simulation_number,
                label=account.label,
                starting_balance=account.starting_balance,
                is_active=account.is_active,
                created_at=account.created_at,
                archived_at=account.archived_at,
                closed_trade_count=len(closed),
                realized_pnl_dollars=realized,
                win_rate_pct=(wins / len(closed) * 100) if closed else None,
            )
        )
    return summaries


@router.post("/simulations", response_model=PaperAccountOut)
def start_simulation(
    request: PaperStartSimulationRequest,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    try:
        account = engine.start_new_simulation(user.id, request.starting_capital, db, label=request.label)
    except PaperTradingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _account_out(account, db, provider)


@router.get("/positions", response_model=list[PaperPositionOut])
def list_positions(
    status: str = "open",
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    if status == "open":
        positions = engine.list_open_positions(user.id, db)
    elif status == "closed":
        positions = engine.list_closed_positions(user.id, db)
    else:
        raise HTTPException(status_code=400, detail="status must be 'open' or 'closed'")
    return [_with_mark_to_market(p, provider) for p in positions]


@router.post("/positions", response_model=PaperPositionOut)
def open_position(
    request: PaperOpenRequest,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    # A ProviderDataUnavailable from analyze_ticker()/get_quote() is left
    # uncaught here — it propagates to app.main's global exception handler,
    # which already answers with the honest, structured 503 the rest of
    # the platform uses for "provider can't serve this symbol right now."
    try:
        position = engine.open_position(user.id, request.ticker_symbol, request.quantity, db, provider)
    except PaperTradingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _with_mark_to_market(position, provider)


@router.post("/positions/{position_id}/close", response_model=PaperPositionOut)
def close_position(
    position_id: int,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    try:
        position = engine.close_position(user.id, position_id, db, provider)
    except PaperTradingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _with_mark_to_market(position, provider)
