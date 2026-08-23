"""Asset Universe Manager API — activate/deactivate/add/remove assets
through data, never by editing source code (multi-asset spec §2). Reads are
public (the universe list itself isn't sensitive); writes require the
operator role, mirroring the existing pattern in models.py/scan.py.

Distinct from GET /stocks/universe, which remains the OTC scanner's own
(unrelated, still-mock-backed) ticker list — see services/universe/manager.py
module docstring for why the two stay separate for now.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.db.models.asset import Asset
from app.db.models.user import User
from app.schemas.universe import UniverseAssetCreate, UniverseAssetOut, UniverseAssetUpdate

router = APIRouter(prefix="/universe", tags=["universe"])


@router.get("", response_model=list[UniverseAssetOut])
def list_universe(
    asset_type: str | None = None,
    include_inactive: bool = False,
    db: Session = Depends(db_session),
):
    query = db.query(Asset)
    if not include_inactive:
        query = query.filter(Asset.is_active.is_(True))
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type.upper())
    return query.order_by(Asset.symbol).all()


@router.post("", response_model=UniverseAssetOut, status_code=201)
def add_asset(
    payload: UniverseAssetCreate,
    db: Session = Depends(db_session),
    _operator: User = Depends(require_operator),
):
    symbol = payload.symbol.upper()
    if db.query(Asset).filter_by(symbol=symbol).one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"{symbol} already exists in the universe")

    asset = Asset(
        symbol=symbol,
        asset_type=payload.asset_type,
        name=payload.name,
        exchange=payload.exchange,
        currency=payload.currency,
        provider=payload.provider,
        is_active=True,
        tradable=payload.tradable,
        supported_timeframes=["1d"],
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.patch("/{symbol}", response_model=UniverseAssetOut)
def update_asset(
    symbol: str,
    payload: UniverseAssetUpdate,
    db: Session = Depends(db_session),
    _operator: User = Depends(require_operator),
):
    asset = db.query(Asset).filter_by(symbol=symbol.upper()).one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"{symbol.upper()} is not in the universe")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{symbol}")
def remove_asset(
    symbol: str,
    db: Session = Depends(db_session),
    _operator: User = Depends(require_operator),
):
    asset = db.query(Asset).filter_by(symbol=symbol.upper()).one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"{symbol.upper()} is not in the universe")
    db.delete(asset)
    db.commit()
    return {"status": "removed", "symbol": symbol.upper()}
