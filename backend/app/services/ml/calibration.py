"""Probability calibration.

Raw GBM probability outputs are frequently over-confident, especially on
imbalanced, noisy penny-stock data. We fit an isotonic regressor per horizon
on held-out validation predictions vs. realized outcomes so the platform's
probabilities are honest (a model that says "70% probability of +10%" should
be right about 70% of the time historically).
"""
from __future__ import annotations

import numpy as np


class ProbabilityCalibrator:
    def __init__(self):
        self._calibrator = None
        self._fitted = False

    def fit(self, raw_probs: np.ndarray, outcomes: np.ndarray) -> "ProbabilityCalibrator":
        from sklearn.isotonic import IsotonicRegression

        self._calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.01, y_max=0.99)
        self._calibrator.fit(raw_probs, outcomes)
        self._fitted = True
        return self

    def transform(self, raw_probs: np.ndarray) -> np.ndarray:
        if not self._fitted:
            # Without enough historical outcomes yet, apply a mild shrink-to-prior
            # instead of pretending the raw GBM output is already calibrated.
            return 0.5 + (np.asarray(raw_probs) - 0.5) * 0.7
        return self._calibrator.predict(np.asarray(raw_probs))
