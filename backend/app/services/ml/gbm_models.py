"""Gradient-boosting model wrappers with a uniform sklearn-like interface.

Each wrapper prefers its native library (LightGBM / XGBoost / CatBoost) but
transparently falls back to `sklearn.ensemble.GradientBoostingClassifier`
if the native package isn't installed in the current environment (e.g. a
constrained CI runner). This keeps `services/ml/ensemble.py` and the training
pipeline working everywhere while production images install the real thing
via requirements.txt.
"""
from __future__ import annotations

from typing import Protocol

import numpy as np


class ProbabilisticClassifier(Protocol):
    def fit(self, X: np.ndarray, y: np.ndarray) -> "ProbabilisticClassifier": ...

    def predict_proba_positive(self, X: np.ndarray) -> np.ndarray: ...

    def feature_importances(self) -> np.ndarray: ...


class _SklearnFallback:
    def __init__(self, random_state: int = 42, **kwargs):
        from sklearn.ensemble import GradientBoostingClassifier

        self.model = GradientBoostingClassifier(random_state=random_state, n_estimators=150, max_depth=3)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict_proba_positive(self, X):
        return self.model.predict_proba(X)[:, 1]

    def feature_importances(self):
        return self.model.feature_importances_


class LightGBMModel:
    # NB: only picklable state on the instance (a bool flag, never the
    # imported module) — model artifacts are persisted with pickle.
    def __init__(self, random_state: int = 42, **kwargs):
        try:
            import lightgbm as lgb

            self._native = True
            self.model = lgb.LGBMClassifier(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.05,
                random_state=random_state,
                verbosity=-1,
                **kwargs,
            )
        except ImportError:
            self._native = False
            self.model = _SklearnFallback(random_state=random_state)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict_proba_positive(self, X):
        if self._native:
            return self.model.predict_proba(X)[:, 1]
        return self.model.predict_proba_positive(X)

    def feature_importances(self):
        if self._native:
            imp = self.model.feature_importances_
            return imp / (imp.sum() or 1)
        return self.model.feature_importances()


class XGBoostModel:
    def __init__(self, random_state: int = 42, **kwargs):
        try:
            import xgboost as xgb

            self._native = True
            self.model = xgb.XGBClassifier(
                n_estimators=200,
                max_depth=4,
                learning_rate=0.05,
                random_state=random_state,
                eval_metric="logloss",
                **kwargs,
            )
        except ImportError:
            self._native = False
            self.model = _SklearnFallback(random_state=random_state)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict_proba_positive(self, X):
        if self._native:
            return self.model.predict_proba(X)[:, 1]
        return self.model.predict_proba_positive(X)

    def feature_importances(self):
        if self._native:
            imp = self.model.feature_importances_
            return imp / (imp.sum() or 1)
        return self.model.feature_importances()


class CatBoostModel:
    def __init__(self, random_state: int = 42, **kwargs):
        try:
            from catboost import CatBoostClassifier

            self.model = CatBoostClassifier(
                iterations=200,
                depth=5,
                learning_rate=0.05,
                random_state=random_state,
                verbose=False,
                **kwargs,
            )
            self._native = True
        except ImportError:
            self.model = _SklearnFallback(random_state=random_state)
            self._native = False

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict_proba_positive(self, X):
        if self._native:
            return self.model.predict_proba(X)[:, 1]
        return self.model.predict_proba_positive(X)

    def feature_importances(self):
        if self._native:
            imp = np.asarray(self.model.get_feature_importance())
            return imp / (imp.sum() or 1)
        return self.model.feature_importances()
