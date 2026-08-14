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
- The comparison also includes the HEURISTIC engine (production's real
  fallback formula, `EnsembleModel._heuristic_prior()`, run on the exact
  same holdout — never a stand-in) and three simple statistical baselines
  (logistic regression, a single-indicator momentum rule, and the naive
  "always take the trade" / buy-and-hold rate). `promote_model()` hard-
  refuses promotion unless the challenger's out-of-sample AUC on the
  platform's primary +10% threshold beats every one of them — this is the
  spec's "never activate a trained model unless it beats the heuristic and
  baseline in valid out-of-sample testing" rule enforced in code, not left
  to operator discretion.
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


def _metrics_from_predictions(preds: np.ndarray, y: np.ndarray) -> dict:
    """AUC + calibration gap + Brier score for one threshold's predicted
    probabilities vs. realized binary outcomes — the shared scoring used
    for every subject compared here (challenger, champion, heuristic, and
    every simple baseline), so "beats X" always means the same thing.
    """
    from sklearn.metrics import roc_auc_score

    entry: dict = {"positive_rate": round(float(y.mean()), 3)}
    if len(np.unique(y)) == 2:
        entry["auc"] = round(float(roc_auc_score(y, preds)), 4)
    entry["calibration_gap"] = round(float(abs(preds.mean() - y.mean())), 4)
    entry["brier_score"] = round(float(np.mean((preds - y) ** 2)), 4)
    return entry


def _evaluate(model: EnsembleModel | None, X: np.ndarray, labels: dict[int, np.ndarray]) -> dict:
    """Per-threshold metrics for an EnsembleModel (trained or not — an
    untrained instance transparently falls back to the production
    heuristic prior, which is how the "heuristic" comparison below reuses
    this same function). None model = no champion artifact exists yet.
    """
    if model is None:
        return {"note": "no champion artifact exists yet"}

    metrics: dict = {}
    for threshold in HORIZON_THRESHOLDS:
        y = labels[threshold]
        preds = np.array([model.predict(X[i]).probabilities[threshold] for i in range(len(X))])
        metrics[f"+{threshold}%"] = _metrics_from_predictions(preds, y)
    return metrics


def _momentum_baseline(X: np.ndarray) -> np.ndarray:
    """Single-indicator naive baseline: higher RSI -> higher probability of
    continued upside, nothing else considered. `rsi_14` is FEATURE_NAMES[0].
    """
    rsi = X[:, FEATURE_NAMES.index("rsi_14")]
    return np.clip((rsi - 30) / 40, 0.0, 1.0)


def _evaluate_baselines(
    X_train: np.ndarray, y_train: dict[int, np.ndarray], X_hold: np.ndarray, y_hold: dict[int, np.ndarray]
) -> dict:
    """Three simple, non-ML-ensemble predictors, fit on the same training
    split and scored on the same holdout as the challenger — the concrete
    "beats a naive baseline" evidence the spec requires alongside "beats
    the heuristic."
    """
    from sklearn.linear_model import LogisticRegression

    baselines: dict[str, dict] = {"logistic_regression": {}, "momentum": {}, "always_take_the_trade": {}}
    momentum_preds = _momentum_baseline(X_hold)

    for threshold in HORIZON_THRESHOLDS:
        key = f"+{threshold}%"
        y_tr, y_ho = y_train[threshold], y_hold[threshold]

        baselines["momentum"][key] = _metrics_from_predictions(momentum_preds, y_ho)

        # A naive predictor that always assumes the position is held to
        # horizon regardless of any signal — mathematically identical here
        # to "always predict the training-set base rate," since the label
        # itself already encodes "did an unconditionally-held position
        # touch +T%." This IS the buy-and-hold baseline in this framing.
        base_rate = float(y_tr.mean()) if len(y_tr) else 0.0
        baselines["always_take_the_trade"][key] = _metrics_from_predictions(np.full(len(y_ho), base_rate), y_ho)

        if len(np.unique(y_tr)) < 2:
            baselines["logistic_regression"][key] = {"note": "training split has only one class for this threshold"}
            continue
        lr = LogisticRegression(max_iter=1000)
        lr.fit(X_train, y_tr)
        lr_preds = lr.predict_proba(X_hold)[:, 1]
        baselines["logistic_regression"][key] = _metrics_from_predictions(lr_preds, y_ho)

    return baselines


PRIMARY_THRESHOLD_KEY = "+10%"


def _primary_auc(per_threshold_metrics: dict) -> float | None:
    """Extracts the primary (+10%) threshold's AUC from any of the
    same-shaped per-threshold metric dicts this module produces (challenger,
    champion, heuristic via `_evaluate()`; each baseline via
    `_evaluate_baselines()`)."""
    return per_threshold_metrics.get(PRIMARY_THRESHOLD_KEY, {}).get("auc")


def _beats(challenger_metrics: dict, other_metrics: dict) -> bool:
    """True only when the challenger has a *strictly higher* AUC than the
    comparison subject on the primary threshold and both AUCs were
    computable. A missing/incomputable AUC on either side is never treated
    as a pass — an ungradeable comparison is not evidence of beating
    anything.
    """
    challenger_auc = _primary_auc(challenger_metrics)
    other_auc = _primary_auc(other_metrics)
    if challenger_auc is None or other_auc is None:
        return False
    return challenger_auc > other_auc


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
    challenger_metrics = _evaluate(challenger, X_hold, y_hold)
    # A fresh, never-fitted EnsembleModel transparently falls back to the
    # exact production heuristic prior for every prediction — this reuses
    # the real production code path, not a re-implementation of it.
    heuristic_metrics = _evaluate(EnsembleModel(), X_hold, y_hold)
    baseline_metrics = _evaluate_baselines(X_train, y_train, X_hold, y_hold)

    comparisons_to_beat = {"heuristic": heuristic_metrics, **baseline_metrics}
    beats: dict[str, bool] = {name: _beats(challenger_metrics, m) for name, m in comparisons_to_beat.items()}

    comparison = {
        "holdout_rows": len(X_hold),
        "training_rows": len(X_train),
        "temporal_split": "newest 25% held out",
        "primary_threshold": PRIMARY_THRESHOLD_KEY,
        "challenger": challenger_metrics,
        "champion": _evaluate(champion, X_hold, y_hold),
        "heuristic": heuristic_metrics,
        "baselines": baseline_metrics,
        # Decision-support only — promote_model() re-derives this from the
        # same stored metrics rather than trusting this cached bool, so it
        # can never be edited to bypass the gate.
        "beats_on_primary_threshold": beats,
        "eligible_for_promotion": all(beats.values()),
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


class PromotionRefused(RuntimeError):
    """The challenger does not demonstrably beat the heuristic engine and/or
    a simple statistical baseline's out-of-sample AUC on the primary +10%
    threshold. This is the spec's non-negotiable "never activate a trained
    model unless it beats the heuristic and baseline in valid out-of-sample
    testing" rule — a human can approve a promotion, but never override
    this floor.
    """


def promote_model(db: Session, version_id: int, artifact_dir: str | None = None) -> ModelVersion:
    """Human-approved promotion: challenger becomes champion. Re-derives
    the beats-heuristic-and-baselines verdict from the version's own stored
    comparison (never trusts a cached boolean) and hard-refuses if it
    doesn't hold — including for a ModelVersion trained by an older
    `train_challenger()` that never recorded the comparison at all.
    """
    settings = get_settings()
    version = db.query(ModelVersion).filter_by(id=version_id).one_or_none()
    if version is None:
        raise ValueError(f"ModelVersion {version_id} not found")

    metrics = version.training_metrics or {}
    challenger_metrics = metrics.get("challenger")
    comparisons_to_beat = {"heuristic": metrics.get("heuristic"), **(metrics.get("baselines") or {})}
    if not challenger_metrics or not all(comparisons_to_beat.values()):
        raise PromotionRefused(
            f"ModelVersion {version_id} has no recorded heuristic/baseline comparison to verify — "
            "was it trained before this check existed? Retrain with the current train_challenger() before promoting."
        )
    failed = [name for name, m in comparisons_to_beat.items() if not _beats(challenger_metrics, m)]
    if failed:
        raise PromotionRefused(
            f"ModelVersion {version_id} does not beat the following on the {PRIMARY_THRESHOLD_KEY} AUC: "
            f"{', '.join(failed)}. Promotion refused — see training_metrics for the full comparison."
        )

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
