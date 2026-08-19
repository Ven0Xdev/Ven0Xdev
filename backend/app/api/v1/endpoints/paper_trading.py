from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, get_current_user
from app.db.models.paper_trading import PaperPosition, PaperTradingAccount
from app.db.models.user import User
from app.schemas.paper_trading import (
    AutonomousTradingToggleRequest,
    PaperAccountOut,
    PaperOpenRequest,
    PaperOrderOut,
    PaperOrderRequest,
    PaperPositionOut,
    PaperSimulationSummary,
    PaperStartSimulationRequest,
    TradeOut,
    WhyNoTradeGateOut,
    WhyNoTradeOut,
)
from app.services.data_providers.base import MarketDataProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import PaperTradingError
from app.services.paper_trading.orders import OrderError

router = APIRouter(prefix="/paper-trading", tags=["paper-trading"])


def _with_mark_to_market(position: PaperPosition, provider: MarketDataProvider) -> PaperPositionOut:
    out = PaperPositionOut.model_validate(position)
    if position.status != "open":
        return out
    try:
        quote = provider.get_quote(position.ticker_symbol)
    except Exception:
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
        except Exception:
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


@router.post("/autonomous", response_model=PaperAccountOut)
def toggle_autonomous_trading(
    request: AutonomousTradingToggleRequest,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """Explicit per-simulation opt-in/out for autonomous paper trading —
    see services/paper_trading/autonomous.py's module docstring for the
    full gate this alone does not bypass (Red-Team, shadow track record,
    position limits, the platform-wide emergency stop)."""
    try:
        account = engine.set_autonomous_trading_enabled(user.id, request.enabled, db)
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


@router.get("/why-no-trade/{symbol}", response_model=WhyNoTradeOut)
def why_no_trade(
    symbol: str,
    timeframe: str = "1D",
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """Read-only diagnostic: walks every gate autonomous paper trading
    itself checks (services/paper_trading/autonomous.py) for this user's
    active simulation and this ticker, without opening or closing
    anything. Requires an active simulation — there is no account to
    diagnose gates against otherwise."""
    from app.services.paper_trading.why_no_trade import why_no_trade as build_report

    account = engine.get_active_account(user.id, db)
    if account is None:
        raise HTTPException(status_code=404, detail="Start a paper trading simulation first.")
    report = build_report(db, account, symbol, timeframe, provider)
    return WhyNoTradeOut(
        ticker=report.ticker, timeframe=report.timeframe, market_state=report.market_state,
        provider=report.provider, data_mode=report.data_mode, data_freshness=report.data_freshness,
        ncs_state=report.ncs_state, ncs_fired=report.ncs_fired, ncs_vetoed=report.ncs_vetoed,
        red_team_result=report.red_team_result, shadow_sample_size=report.shadow_sample_size,
        shadow_win_rate_pct=report.shadow_win_rate_pct, drift_status=report.drift_status,
        risk_gate_passed=report.risk_gate_passed, risk_gate_reasons=report.risk_gate_reasons,
        gates=[WhyNoTradeGateOut(name=g.name, passed=g.passed, detail=g.detail) for g in report.gates],
        permitted=report.permitted, blockers=report.blockers,
    )


@router.post("/orders", response_model=PaperOrderOut)
def submit_order(
    request: PaperOrderRequest,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """NEXORA INTERNAL PAPER order ticket — never a real broker order.
    Market orders resolve immediately (see services/paper_trading/
    orders.py); limit/stop orders come back `pending` and only ever fill
    from a future quote via app/workers/order_scheduler.py. Idempotent on
    `idempotency_key`: a retried submission returns the original order."""
    from app.services.paper_trading.orders import submit_order as do_submit

    try:
        order = do_submit(
            user.id, db, provider,
            symbol=request.ticker_symbol, side=request.side, order_type=request.order_type,
            quantity=request.quantity, idempotency_key=request.idempotency_key,
            limit_price=request.limit_price, stop_price=request.stop_price,
            take_profit=request.take_profit, stop_loss=request.stop_loss,
            regular_hours_only=request.regular_hours_only, position_id=request.position_id,
        )
    except OrderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return order


@router.get("/orders", response_model=list[PaperOrderOut])
def list_orders(
    status: str | None = None, db: Session = Depends(db_session), user: User = Depends(get_current_user),
):
    from app.services.paper_trading.orders import list_orders as do_list

    return do_list(user.id, db, status=status)


@router.post("/orders/{order_id}/cancel", response_model=PaperOrderOut)
def cancel_order(order_id: int, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    from app.services.paper_trading.orders import cancel_order as do_cancel

    try:
        return do_cancel(user.id, db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/trades", response_model=list[TradeOut])
def list_trades(limit: int = 100, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    """The immutable fill ledger (Order History tab) — every fill this
    account's orders have ever produced, oldest action last."""
    from app.db.models.trade import Trade

    account = engine.get_active_account(user.id, db)
    if account is None:
        return []
    return (
        db.query(Trade).filter_by(account_id=account.id).order_by(Trade.executed_at.desc()).limit(limit).all()
    )


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
