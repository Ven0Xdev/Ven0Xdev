from datetime import datetime

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class ModelVersion(Base):
    """Registry of trained model artifacts, so every prediction is traceable."""

    __tablename__ = "model_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    model_type: Mapped[str] = mapped_column(String(32))  # lightgbm, xgboost, catboost, ensemble, anomaly, forecast
    trained_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    artifact_path: Mapped[str] = mapped_column(String(255))
    training_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    hyperparameters: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(default=True)
