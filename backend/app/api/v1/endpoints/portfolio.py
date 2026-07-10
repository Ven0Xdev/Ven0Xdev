from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session
from app.db.models.portfolio import PortfolioPosition
from app.schemas.portfolio import PortfolioPositionCreate, PortfolioPositionOut
from app.services.data_providers.base import MarketDataProvider

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=list[PortfolioPositionOut])
def list_positions(db: Session = Depends(db_session), provider: MarketDataProvider = Depends(data_provider)):
    positions = db.query(PortfolioPosition).filter_by(status="open").all()
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
def open_position(request: PortfolioPositionCreate, db: Session = Depends(db_session)):
    position = PortfolioPosition(
        ticker_symbol=request.ticker_symbol.upper(),
        quantity=request.quantity,
        avg_entry_price=request.avg_entry_price,
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
def close_position(position_id: int, db: Session = Depends(db_session)):
    position = db.query(PortfolioPosition).filter_by(id=position_id).one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    position.status = "closed"
    db.add(position)
    db.commit()
    return {"status": "closed", "id": position_id}
