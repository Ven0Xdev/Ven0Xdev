"""EnsembleModel.predict()'s is_trained flag — the single source of truth
scorer.py uses to decide whether an analysis is honestly labeled HEURISTIC
or TRAINED_ML. See services/ml/ensemble.py and schemas/stock.py.
"""
from __future__ import annotations

import numpy as np

from app.services.ml.ensemble import HORIZON_THRESHOLDS, EnsembleModel
from app.services.ml.feature_vector import FEATURE_NAMES


def _random_row(rng: np.random.Generator) -> np.ndarray:
    return rng.normal(size=len(FEATURE_NAMES))


def test_untrained_model_is_never_reported_as_trained():
    model = EnsembleModel()
    rng = np.random.default_rng(0)
    pred = model.predict(_random_row(rng))

    assert pred.is_trained is False
    assert model.version is None
    # Cold-start probabilities must still be finite, bounded values — a
    # heuristic fallback, not a crash or a fabricated constant.
    for p in pred.probabilities.values():
        assert 0.0 <= p <= 1.0


def test_fully_fitted_model_is_reported_as_trained():
    rng = np.random.default_rng(1)
    n = 60
    X = rng.normal(size=(n, len(FEATURE_NAMES)))
    labels = {t: rng.integers(0, 2, size=n) for t in HORIZON_THRESHOLDS}

    model = EnsembleModel().fit(X, labels, FEATURE_NAMES)
    model.version = "20260101000000"
    pred = model.predict(_random_row(rng))

    assert pred.is_trained is True
    assert model.version == "20260101000000"


def test_partially_fitted_model_is_reported_as_heuristic():
    """If even one requested horizon threshold has no fitted trio, the
    whole prediction must be labeled heuristic — a partial trained result
    presented as fully trained would be exactly the kind of dishonest
    labeling this field exists to prevent."""
    rng = np.random.default_rng(2)
    n = 60
    X = rng.normal(size=(n, len(FEATURE_NAMES)))
    only_one_threshold = {HORIZON_THRESHOLDS[0]: rng.integers(0, 2, size=n)}

    model = EnsembleModel().fit(X, only_one_threshold, FEATURE_NAMES)
    pred = model.predict(_random_row(rng))

    assert pred.is_trained is False
