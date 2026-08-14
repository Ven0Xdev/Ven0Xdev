from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.db.models.user import User
from app.services.monitoring.service import build_health_report

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/health")
def platform_health(db: Session = Depends(db_session), _operator: User = Depends(require_operator)):
    """Full platform health: model/feature drift, prediction accuracy and
    calibration, provider failures, scanner freshness, API latency,
    database health — plus rule-evaluated alerts with named thresholds.

    Operator-only (unlike the app-root GET /health, which is the minimal
    public liveness probe): this report names vendor failure rates,
    latency percentiles per route, and calibration gaps — real operational
    detail that must not be handed to an anonymous caller, per the
    platform's security guards."""
    return build_health_report(db)
