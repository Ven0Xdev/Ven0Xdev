"""Chart drawing persistence — trendlines, horizontal/vertical lines,
rays, rectangles, Fibonacci retracements, text, arrows. Every read/write
below is scoped to the AUTHENTICATED user's own id, taken from the
verified token (get_current_user), never from any client-supplied field
— one user can never read, edit, or delete another user's drawings,
regardless of what an id in the URL claims. See
app/db/models/chart_drawing.py for why anchors are always {time, price},
never screen pixels.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, get_current_user
from app.db.models.chart_drawing import ChartDrawing
from app.db.models.user import User
from app.schemas.chart_drawing import ChartDrawingCreate, ChartDrawingOut, ChartDrawingUpdate

router = APIRouter(prefix="/chart-drawings", tags=["chart-drawings"])


@router.get("", response_model=list[ChartDrawingOut])
def list_drawings(
    ticker: str, timeframe: str, db: Session = Depends(db_session), user: User = Depends(get_current_user),
):
    return (
        db.query(ChartDrawing)
        .filter_by(user_id=user.id, ticker_symbol=ticker.upper(), timeframe=timeframe)
        .order_by(ChartDrawing.created_at.asc())
        .all()
    )


@router.post("", response_model=ChartDrawingOut)
def create_drawing(
    request: ChartDrawingCreate, db: Session = Depends(db_session), user: User = Depends(get_current_user),
):
    drawing = ChartDrawing(
        user_id=user.id, ticker_symbol=request.ticker_symbol.upper(), timeframe=request.timeframe,
        drawing_type=request.drawing_type, data=request.data, locked=request.locked, hidden=request.hidden,
    )
    db.add(drawing)
    db.commit()
    db.refresh(drawing)
    return drawing


def _owned(db: Session, user: User, drawing_id: int) -> ChartDrawing:
    drawing = db.query(ChartDrawing).filter_by(id=drawing_id, user_id=user.id).one_or_none()
    if drawing is None:
        raise HTTPException(status_code=404, detail="No such drawing.")
    return drawing


@router.patch("/{drawing_id}", response_model=ChartDrawingOut)
def update_drawing(
    drawing_id: int, request: ChartDrawingUpdate, db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    drawing = _owned(db, user, drawing_id)
    if request.data is not None:
        drawing.data = request.data
    if request.locked is not None:
        drawing.locked = request.locked
    if request.hidden is not None:
        drawing.hidden = request.hidden
    db.add(drawing)
    db.commit()
    db.refresh(drawing)
    return drawing


@router.delete("/{drawing_id}")
def delete_drawing(drawing_id: int, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    drawing = _owned(db, user, drawing_id)
    db.delete(drawing)
    db.commit()
    return {"deleted": drawing_id}


@router.delete("")
def delete_all_drawings(
    ticker: str, timeframe: str, db: Session = Depends(db_session), user: User = Depends(get_current_user),
):
    deleted = (
        db.query(ChartDrawing)
        .filter_by(user_id=user.id, ticker_symbol=ticker.upper(), timeframe=timeframe)
        .delete()
    )
    db.commit()
    return {"deleted": deleted}
