from datetime import datetime

from sqlalchemy import JSON, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class DriftBaseline(Base):
    """A frozen PSI reference distribution for one exact prediction cohort
    (engine_mode, model_version, risk_policy_version, feature_schema_version,
    provider_class, data_mode — see services/monitoring/drift.py).

    Immutable by policy: once established for a cohort, this row is never
    silently recomputed on a later drift_report() call — a sliding "most
    recent N vs previous N" comparison isn't a real baseline, since what
    counts as "reference" drifts right along with what counts as "recent."
    Built exactly once per cohort, from that cohort's own matured (Outcome-
    joined) predictions only — never from provisional, not-yet-realized
    snapshots — and only ever replaced by an explicit operator rebuild
    (services/monitoring/drift.py's rebuild_baseline(), surfaced at
    POST /admin/drift/rebaseline).
    """

    __tablename__ = "drift_baselines"
    __table_args__ = (
        Index(
            "ux_drift_baselines_cohort",
            "engine_mode", "model_version", "risk_policy_version",
            "feature_schema_version", "provider_class", "data_mode",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    engine_mode: Mapped[str] = mapped_column(String(16))
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_policy_version: Mapped[str] = mapped_column(String(48))
    feature_schema_version: Mapped[str] = mapped_column(String(32))
    provider_class: Mapped[str] = mapped_column(String(32))
    data_mode: Mapped[str] = mapped_column(String(16))

    established_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    sample_size: Mapped[int] = mapped_column(Integer)
    # {attribute_name: [raw values]} for every model-output attribute and
    # FEATURE_NAMES feature this cohort's matured predictions had — the
    # frozen PSI reference. Attribute names double as the dict keys
    # regime_breakdown_metrics-style helpers elsewhere already use.
    values: Mapped[dict] = mapped_column(JSON)
