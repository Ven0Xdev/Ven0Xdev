"""News/social sentiment aggregation.

Uses provider-supplied per-article sentiment (in production this would be a
FinBERT/transformer classifier over live news + social feeds — see
`services/ml/text_model.py` for the plug point). Down-weights promotional
content since paid stock promotion inflates sentiment without reflecting
genuine market conviction.
"""
from __future__ import annotations

import numpy as np

from app.services.data_providers.base import NewsArticle


def compute_sentiment_score(news: list[NewsArticle]) -> tuple[float, dict]:
    if not news:
        return 50.0, {"article_count": 0, "promotional_ratio": 0.0, "avg_sentiment": 0.0}

    weights = np.array([0.3 if n.is_promotional else 1.0 for n in news])
    sentiments = np.array([n.sentiment for n in news])
    weighted_avg = float(np.average(sentiments, weights=weights))
    score = float(np.clip((weighted_avg + 1) / 2 * 100, 0, 100))

    promo_ratio = float(np.mean([n.is_promotional for n in news]))
    return score, {
        "article_count": len(news),
        "promotional_ratio": promo_ratio,
        "avg_sentiment": weighted_avg,
        "press_release_ratio": float(np.mean([n.is_press_release for n in news])),
    }
