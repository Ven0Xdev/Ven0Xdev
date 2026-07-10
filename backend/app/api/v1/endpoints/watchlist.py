from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.db.models.portfolio import WatchlistItem
from app.schemas.portfolio import WatchlistAddRequest, WatchlistItemOut

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist(db: Session = Depends(db_session)):
    return db.query(WatchlistItem).order_by(WatchlistItem.added_at.desc()).all()


@router.post("", response_model=WatchlistItemOut)
def add_to_watchlist(request: WatchlistAddRequest, db: Session = Depends(db_session)):
    symbol = request.ticker_symbol.upper()
    existing = db.query(WatchlistItem).filter_by(ticker_symbol=symbol).one_or_none()
    if existing:
        return existing
    item = WatchlistItem(ticker_symbol=symbol, note=request.note)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{symbol}")
def remove_from_watchlist(symbol: str, db: Session = Depends(db_session)):
    item = db.query(WatchlistItem).filter_by(ticker_symbol=symbol.upper()).one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    db.delete(item)
    db.commit()
    return {"status": "removed", "ticker_symbol": symbol.upper()}
