from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.db.models.model_version import ModelVersion
from app.db.models.user import User
from app.services.ml.champion_challenger import NotEnoughHistory, PromotionRefused, promote_model, train_challenger

router = APIRouter(prefix="/models", tags=["models"])


def _serialize(v: ModelVersion) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "version": v.version,
        "model_type": v.model_type,
        "trained_at": v.trained_at,
        "is_active": v.is_active,
        "metrics": v.training_metrics,
        "hyperparameters": v.hyperparameters,
    }


@router.get("")
def list_models(db: Session = Depends(db_session)):
    """Model registry: the champion (is_active) and every challenger with
    its side-by-side holdout comparison."""
    rows = db.query(ModelVersion).order_by(ModelVersion.trained_at.desc()).all()
    return [_serialize(v) for v in rows]


@router.post("/train-challenger")
def train_challenger_endpoint(db: Session = Depends(db_session), operator: User = Depends(require_operator)):
    """Train a challenger on real graded outcomes. The result is REGISTERED
    but NEVER deployed — read the comparison, then decide to promote."""
    try:
        version = train_challenger(db)
    except NotEnoughHistory as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _serialize(version)


@router.post("/{version_id}/promote")
def promote_endpoint(version_id: int, db: Session = Depends(db_session), operator: User = Depends(require_operator)):
    """Human approval gate: promote a registered challenger to champion.
    This is the ONLY path by which a new model starts serving predictions."""
    try:
        version = promote_model(db, version_id)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PromotionRefused as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _serialize(version)
