"""Catalyst scoring: how much near-term, price-moving news flow exists."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from app.services.data_providers.base import CorporateAction, NewsArticle

_CATALYST_KEYWORDS = {
    "uplisting": 25,
    "partnership": 15,
    "fda": 30,
    "acquisition": 25,
    "merger": 25,
    "contract": 15,
    "patent": 12,
    "offering": -20,
    "dilution": -20,
    "delisting": -35,
    "going concern": -30,
    "reverse split": -15,
}


def compute_catalyst_score(news: list[NewsArticle], corporate_actions: list[CorporateAction]) -> tuple[float, dict]:
    now = datetime.now(timezone.utc)
    recent_news = [n for n in news if (now - n.published_at.replace(tzinfo=timezone.utc)).days <= 30]

    raw = 40.0  # neutral baseline
    matched: list[str] = []
    for article in recent_news:
        headline_lower = article.headline.lower()
        recency_weight = max(0.2, 1 - (now - article.published_at.replace(tzinfo=timezone.utc)).days / 30)
        for kw, weight in _CATALYST_KEYWORDS.items():
            if kw in headline_lower:
                raw += weight * recency_weight
                matched.append(kw)

    upcoming_uplisting = any("uplist" in a.action_type for a in corporate_actions)
    if upcoming_uplisting:
        raw += 10

    score = float(np.clip(raw, 0, 100))
    return score, {
        "recent_catalyst_articles": len(recent_news),
        "matched_keywords": sorted(set(matched)),
    }
