from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.services.monitoring.service import build_health_report

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/health")
def platform_health(db: Session = Depends(db_session)):
    """Full platform health: model/feature drift, prediction accuracy and
    calibration, provider failures, scanner freshness, API latency,
    database health — plus rule-evaluated alerts with named thresholds."""
    return build_health_report(db)
