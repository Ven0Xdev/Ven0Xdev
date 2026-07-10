"""Ensemble of LightGBM + XGBoost + CatBoost, one sub-model per return
threshold/horizon combination, combined by confidence-weighted averaging
and passed through isotonic calibration. No single model is trusted alone.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.services.ml.calibration import ProbabilityCalibrator
from app.services.ml.gbm_models import CatBoostModel, LightGBMModel, XGBoostModel

HORIZON_THRESHOLDS = [5, 10, 20]  # % up-moves we estimate probability for


@dataclass
class EnsemblePrediction:
    probabilities: dict[int, float]  # threshold_pct -> calibrated probability
    raw_model_outputs: dict[str, dict[int, float]]
    feature_importance: dict[str, float]
    agreement_score: float  # 0-1, how much the 3 models agree (proxy for confidence)


class EnsembleModel:
    """One (LightGBM, XGBoost, CatBoost) trio per horizon threshold."""

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.models: dict[int, dict[str, object]] = {}
        self.calibrators: dict[int, ProbabilityCalibrator] = {}
        self._feature_names: list[str] = []
        self._fitted = False

    def fit(self, X: np.ndarray, labels_by_threshold: dict[int, np.ndarray], feature_names: list[str]) -> "EnsembleModel":
        self._feature_names = feature_names
        for threshold, y in labels_by_threshold.items():
            trio = {
                "lightgbm": LightGBMModel(random_state=self.random_state).fit(X, y),
                "xgboost": XGBoostModel(random_state=self.random_state).fit(X, y),
                "catboost": CatBoostModel(random_state=self.random_state).fit(X, y),
            }
            self.models[threshold] = trio

            raw_probs = np.mean([m.predict_proba_positive(X) for m in trio.values()], axis=0)
            calibrator = ProbabilityCalibrator().fit(raw_probs, y)
            self.calibrators[threshold] = calibrator
        self._fitted = True
        return self

    def predict(self, x_row: np.ndarray) -> EnsemblePrediction:
        x_row = np.asarray(x_row).reshape(1, -1)
        probabilities: dict[int, float] = {}
        raw_outputs: dict[str, dict[int, float]] = {"lightgbm": {}, "xgboost": {}, "catboost": {}}
        agreement_scores = []

        for threshold in HORIZON_THRESHOLDS:
            if self._fitted and threshold in self.models:
                trio = self.models[threshold]
                per_model = {name: float(m.predict_proba_positive(x_row)[0]) for name, m in trio.items()}
                for name, p in per_model.items():
                    raw_outputs[name][threshold] = p
                raw_mean = float(np.mean(list(per_model.values())))
                spread = float(np.std(list(per_model.values())))
                agreement_scores.append(1 - min(spread * 4, 1))
                calibrated = float(np.clip(self.calibrators[threshold].transform(np.array([raw_mean]))[0], 0.01, 0.99))
            else:
                # Cold start (no trained artifact yet): fall back to a
                # feature-driven heuristic prior rather than a trained model.
                calibrated = self._heuristic_prior(x_row[0], threshold)
                agreement_scores.append(0.5)
            probabilities[threshold] = calibrated

        importance = self._aggregate_importance()
        return EnsemblePrediction(
            probabilities=probabilities,
            raw_model_outputs=raw_outputs,
            feature_importance=importance,
            agreement_score=float(np.mean(agreement_scores)) if agreement_scores else 0.5,
        )

    def _aggregate_importance(self) -> dict[str, float]:
        if not self._fitted or not self._feature_names:
            return {}
        all_importances = []
        for trio in self.models.values():
            for model in trio.values():
                all_importances.append(model.feature_importances())
        if not all_importances:
            return {}
        avg = np.mean(all_importances, axis=0)
        return dict(zip(self._feature_names, [float(v) for v in avg]))

    @staticmethod
    def _heuristic_prior(features: np.ndarray, threshold: int) -> float:
        """Feature-driven fallback used only before any model has been
        trained on real outcome data, so cold-start predictions are still
        grounded in the input features rather than a constant.
        """
        from app.services.ml.feature_vector import FEATURE_NAMES

        f = dict(zip(FEATURE_NAMES, features))
        bullish = 0.0
        bullish += np.clip((f.get("rsi_14", 50) - 50) / 50, -1, 1) * 0.15
        bullish += np.clip(f.get("macd_histogram", 0), -1, 1) * 0.1
        bullish += np.clip((f.get("catalyst_score", 40) - 40) / 60, -1, 1) * 0.2
        bullish += np.clip((f.get("sentiment_score", 50) - 50) / 50, -1, 1) * 0.15
        bullish -= np.clip(f.get("manipulation_risk", 20) / 100, 0, 1) * 0.35
        bullish += np.clip((f.get("liquidity_score", 50) - 50) / 50, -1, 1) * 0.1

        base = {5: 0.42, 10: 0.28, 20: 0.15}[threshold]
        adjusted = base + bullish * 0.25
        return float(np.clip(adjusted, 0.03, 0.9))
