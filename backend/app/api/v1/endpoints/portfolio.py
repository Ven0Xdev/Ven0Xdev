from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import DEV_EMAIL, data_provider, db_session, get_current_user
from app.db.models.portfolio import PortfolioPosition
from app.db.models.user import User
from app.schemas.portfolio import PortfolioPositionCreate, PortfolioPositionOut
from app.services.data_providers.base import MarketDataProvider

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _owned(query, user: User):
    if user.email == DEV_EMAIL:
        return query.filter(or_(PortfolioPosition.user_id == user.id, PortfolioPosition.user_id.is_(None)))
    return query.filter(PortfolioPosition.user_id == user.id)


@router.get("/health")
def portfolio_health(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """Portfolio Intelligence report: exposure, concentration (HHI, sector),
    weighted risk profile, diversification grade, per-position sizing
    verdicts against risk-derived ceilings, and named alerts."""
    from dataclasses import asdict

    from app.services.portfolio_intel.engine import assess_portfolio

    include_legacy = user.email == DEV_EMAIL
    return asdict(assess_portfolio(db, provider, user_id=user.id, include_unowned=include_legacy))


@router.get("/recommendation/{symbol}")
def position_recommendation(
    symbol: str,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
):
    """Full recommendation dossier: why buy, why not, biggest risks,
    confidence calculation, manipulation, liquidity, historical
    similarities, missing information, invalidation conditions."""
    from fastapi import HTTPException

    from app.services.portfolio_intel.recommendation import build_recommendation_dossier

    try:
        return build_recommendation_dossier(symbol, provider, db=db)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Could not build dossier for {symbol}: {exc}") from exc


@router.get("", response_model=list[PortfolioPositionOut])
def list_positions(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    positions = _owned(db.query(PortfolioPosition).filter_by(status="open"), user).all()
    out = []
    for p in positions:
        try:
            quote = provider.get_quote(p.ticker_symbol)
            current_price = quote.last
            pnl_pct = (current_price / p.avg_entry_price - 1) * 100 if p.avg_entry_price else None
        except Exception:
            current_price, pnl_pct = None, None
        out.append(
            PortfolioPositionOut(
                ticker_symbol=p.ticker_symbol,
                quantity=p.quantity,
                avg_entry_price=p.avg_entry_price,
                opened_at=p.opened_at,
                status=p.status,
                current_price=current_price,
                unrealized_pnl_pct=pnl_pct,
            )
        )
    return out


@router.post("", response_model=PortfolioPositionOut)
def open_position(
    request: PortfolioPositionCreate,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    position = PortfolioPosition(
        ticker_symbol=request.ticker_symbol.upper(),
        quantity=request.quantity,
        avg_entry_price=request.avg_entry_price,
        user_id=user.id,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return PortfolioPositionOut(
        ticker_symbol=position.ticker_symbol,
        quantity=position.quantity,
        avg_entry_price=position.avg_entry_price,
        opened_at=position.opened_at,
        status=position.status,
    )


@router.post("/{position_id}/close")
def close_position(
    position_id: int,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    position = _owned(db.query(PortfolioPosition).filter_by(id=position_id), user).one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    position.status = "closed"
    db.add(position)
    db.commit()
    return {"status": "closed", "id": position_id}
