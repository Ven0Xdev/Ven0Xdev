"""Champion/Challenger — the self-learning loop's controlled retraining.

The full loop, end to end:

    predictions (features frozen at decision time, `feature_snapshot`)
        -> outcomes (graded by the evaluator; `max_runup_pct` is the label
           source: touched +T% ⇔ max_runup_pct >= T)
        -> label building (here)
        -> challenger training on real history
        -> temporal-holdout comparison vs. the live champion
        -> ModelVersion registry row, is_active=False
        -> HUMAN approval (`promote_model`) — never automatic

Deployment discipline (non-negotiable):
- A challenger is *never* auto-promoted. Training produces a registry entry
  with side-by-side champion/challenger metrics; a human calls the promote
  endpoint after reading them. The comparison is computed on a *temporal*
  holdout (newest 25% of graded predictions) so the challenger is judged on
  data the champion also never trained on, ordered like reality.
- Promotion atomically: writes the artifact to `ensemble_latest.pkl`,
  flips is_active flags in the registry, and invalidates the in-process
  model cache so the next analysis uses the new champion.
"""
from __future__ import annotations

import logging
import pickle
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models.model_version import ModelVersion
from app.db.models.prediction import Outcome, Prediction
from app.services.ml.ensemble import HORIZON_THRESHOLDS, EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES

logger = logging.getLogger(__name__)

MIN_TRAINING_ROWS = 40
HOLDOUT_FRACTION = 0.25


class NotEnoughHistory(RuntimeError):
    pass


@dataclass
class LabeledDataset:
    X: np.ndarray
    labels: dict[int, np.ndarray]   # threshold -> binary labels
    created_at: list[datetime]      # per-row prediction time (for temporal split)


def build_labeled_dataset(db: Session) -> LabeledDataset:
    """Join graded outcomes back to the exact features frozen at prediction
    time. Rows without a stored feature snapshot are skipped (never
    reconstructed after the fact — that would leak information the model
    didn't have at decision time).
    """
    rows = (
        db.query(Prediction, Outcome)
        .join(Outcome, Outcome.prediction_id == Prediction.id)
        .order_by(Prediction.created_at.asc())
        .all()
    )

    X_rows, created, labels = [], [], {t: [] for t in HORIZON_THRESHOLDS}
    for prediction, outcome in rows:
        snapshot = prediction.feature_snapshot or {}
        if not all(name in snapshot for name in FEATURE_NAMES):
            continue
        X_rows.append([float(snapshot[name]) for name in FEATURE_NAMES])
        created.append(prediction.created_at)
        for threshold in HORIZON_THRESHOLDS:
            labels[threshold].append(int(outcome.max_runup_pct >= threshold))

    if len(X_rows) < MIN_TRAINING_ROWS:
        raise NotEnoughHistory(
            f"Only {len(X_rows)} graded predictions with feature snapshots exist; "
            f"challenger training requires >= {MIN_TRAINING_ROWS}. The loop earns "
            f"its retraining data by running — this is by design."
        )

    return LabeledDataset(
        X=np.array(X_rows),
        labels={t: np.array(v) for t, v in labels.items()},
        created_at=created,
    )


def _evaluate(model: EnsembleModel | None, X: np.ndarray, labels: dict[int, np.ndarray]) -> dict:
    """AUC + calibration gap per threshold on a holdout. None model = no champion."""
    from sklearn.metrics import roc_auc_score

    if model is None:
        return {"note": "no champion artifact exists yet"}

    metrics: dict = {}
    for threshold in HORIZON_THRESHOLDS:
        y = labels[threshold]
        preds = np.array([model.predict(X[i]).probabilities[threshold] for i in range(len(X))])
        entry: dict = {"positive_rate": round(float(y.mean()), 3)}
        if len(np.unique(y)) == 2:
            entry["auc"] = round(float(roc_auc_score(y, preds)), 4)
        entry["calibration_gap"] = round(float(abs(preds.mean() - y.mean())), 4)
        metrics[f"+{threshold}%"] = entry
    return metrics


def train_challenger(db: Session, artifact_dir: str | None = None) -> ModelVersion:
    """Train a challenger on real graded history and register it INACTIVE
    with a side-by-side comparison against the current champion.
    """
    settings = get_settings()
    dataset = build_labeled_dataset(db)

    split = int(len(dataset.X) * (1 - HOLDOUT_FRACTION))
    X_train, X_hold = dataset.X[:split], dataset.X[split:]
    y_train = {t: v[:split] for t, v in dataset.labels.items()}
    y_hold = {t: v[split:] for t, v in dataset.labels.items()}

    challenger = EnsembleModel(random_state=settings.random_seed)
    challenger.fit(X_train, y_train, FEATURE_NAMES)

    from app.services.ml.training_pipeline import load_latest_model

    champion = load_latest_model(artifact_dir)
    comparison = {
        "holdout_rows": len(X_hold),
        "training_rows": len(X_train),
        "temporal_split": "newest 25% held out",
        "challenger": _evaluate(challenger, X_hold, y_hold),
        "champion": _evaluate(champion, X_hold, y_hold),
    }

    out_dir = Path(artifact_dir or settings.model_artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    version_tag = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    artifact_path = out_dir / f"challenger_{version_tag}.pkl"
    with open(artifact_path, "wb") as f:
        pickle.dump(challenger, f)

    version = ModelVersion(
        name="ensemble",
        version=version_tag,
        model_type="ensemble",
        artifact_path=str(artifact_path),
        training_metrics=comparison,
        hyperparameters={"trained_on": "real graded outcomes", "min_rows": MIN_TRAINING_ROWS},
        is_active=False,  # NEVER active at birth — a human promotes
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    logger.info("Challenger %s registered (inactive). Comparison: %s", version_tag, comparison)
    return version


def promote_model(db: Session, version_id: int, artifact_dir: str | None = None) -> ModelVersion:
    """Human-approved promotion: challenger becomes champion."""
    settings = get_settings()
    version = db.query(ModelVersion).filter_by(id=version_id).one_or_none()
    if version is None:
        raise ValueError(f"ModelVersion {version_id} not found")
    source = Path(version.artifact_path)
    if not source.exists():
        raise FileNotFoundError(f"Artifact missing on disk: {source}")

    out_dir = Path(artifact_dir or settings.model_artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, out_dir / "ensemble_latest.pkl")

    db.query(ModelVersion).filter(ModelVersion.is_active.is_(True)).update({"is_active": False})
    version.is_active = True
    db.commit()

    # The scorer caches the champion in-process; promotion must bust it.
    from app.services.scoring import scorer

    scorer._cached_model.cache_clear()

    logger.info("ModelVersion %s promoted to champion", version.version)
    return version
