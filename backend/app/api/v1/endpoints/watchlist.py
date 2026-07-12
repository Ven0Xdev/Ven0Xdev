from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import DEV_EMAIL, db_session, get_current_user
from app.db.models.portfolio import WatchlistItem
from app.db.models.user import User
from app.schemas.portfolio import WatchlistAddRequest, WatchlistItemOut

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


def _owned(query, user: User):
    """Ownership scope. The local dev principal also sees legacy rows
    created before multi-tenancy (user_id IS NULL); real accounts see
    strictly their own rows.
    """
    if user.email == DEV_EMAIL:
        return query.filter(or_(WatchlistItem.user_id == user.id, WatchlistItem.user_id.is_(None)))
    return query.filter(WatchlistItem.user_id == user.id)


@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist(db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    return _owned(db.query(WatchlistItem), user).order_by(WatchlistItem.added_at.desc()).all()


@router.post("", response_model=WatchlistItemOut)
def add_to_watchlist(
    request: WatchlistAddRequest,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    symbol = request.ticker_symbol.upper()
    existing = _owned(db.query(WatchlistItem), user).filter(WatchlistItem.ticker_symbol == symbol).one_or_none()
    if existing:
        return existing
    item = WatchlistItem(ticker_symbol=symbol, note=request.note, user_id=user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{symbol}")
def remove_from_watchlist(
    symbol: str,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    item = _owned(db.query(WatchlistItem), user).filter(WatchlistItem.ticker_symbol == symbol.upper()).one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    db.delete(item)
    db.commit()
    return {"status": "removed", "ticker_symbol": symbol.upper()}
