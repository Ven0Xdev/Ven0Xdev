"""Deterministic, keyword-lexicon-based news classification — sentiment,
category, novelty, relevance, reliability, and impact.

Honesty note (matches this codebase's convention everywhere a score is
computed without a trained model — e.g. services/features/manipulation.py's
rule-based flags): this is NOT a trained NLP model. It is a transparent,
reproducible heuristic. Nothing here is presented as ML-derived; callers
that surface these scores must label them as such, never dressed up as
more sophisticated than they are. A real sentiment/impact model is a
natural, additive future upgrade — this module's job is to never leave a
NewsItem un-scored (a hardcoded 0.0 or omitted field, as some existing
provider adapters do — see the recon note in db/models/news.py) while
staying honest about being a heuristic.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# --- sentiment ---------------------------------------------------------------

_POSITIVE_WORDS = {
    "beat", "beats", "beating", "surge", "surges", "surged", "soar", "soars", "soared",
    "rally", "rallies", "rallied", "jump", "jumps", "jumped", "gain", "gains", "gained",
    "upgrade", "upgraded", "outperform", "record", "growth", "profit", "profits", "profitable",
    "strong", "stronger", "strength", "bullish", "optimistic", "expand", "expands", "expansion",
    "approval", "approved", "win", "wins", "won", "success", "successful", "positive",
    "raise", "raises", "raised", "buyback", "dividend", "partnership", "breakthrough",
}
_NEGATIVE_WORDS = {
    "miss", "misses", "missed", "plunge", "plunges", "plunged", "slump", "slumps", "slumped",
    "tumble", "tumbles", "tumbled", "drop", "drops", "dropped", "fall", "falls", "fell",
    "downgrade", "downgraded", "underperform", "loss", "losses", "unprofitable", "weak",
    "weaker", "weakness", "bearish", "pessimistic", "contract", "contracts", "contraction",
    "lawsuit", "sued", "investigation", "probe", "fraud", "recall", "delay", "delayed",
    "layoff", "layoffs", "bankruptcy", "default", "cut", "cuts", "warning", "warns",
    "scandal", "resign", "resigns", "resigned", "fine", "fined", "penalty", "halt", "halted",
}
_UNCERTAIN_WORDS = {"may", "could", "might", "uncertain", "unclear", "mixed", "cautious", "volatility", "volatile"}

_WORD_RE = re.compile(r"[a-z']+")


def classify_sentiment(headline: str, summary: str | None = None) -> tuple[float, str]:
    """Returns (score in [-1, 1], label). A tie or no matched keywords is
    "neutral"; a comparable mix of positive and negative keywords (neither
    dominant) is "uncertain" — distinct from "neutral" (no signal either
    way) per the platform's honesty convention of not collapsing "we don't
    know" into "nothing is happening"."""
    text = f"{headline} {summary or ''}".lower()
    words = set(_WORD_RE.findall(text))
    pos = len(words & _POSITIVE_WORDS)
    neg = len(words & _NEGATIVE_WORDS)
    uncertain = len(words & _UNCERTAIN_WORDS)

    total = pos + neg
    if total == 0:
        return 0.0, "neutral"

    score = (pos - neg) / total
    if uncertain > 0 and abs(pos - neg) <= 1:
        return round(score, 3), "uncertain"
    if score > 0.15:
        return round(score, 3), "positive"
    if score < -0.15:
        return round(score, 3), "negative"
    return round(score, 3), "neutral"


# --- category ------------------------------------------------------------------

_CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "earnings": {"earnings", "eps", "revenue", "quarterly", "q1", "q2", "q3", "q4", "results"},
    "guidance": {"guidance", "outlook", "forecast", "raises guidance", "cuts guidance"},
    "analyst": {"upgrade", "downgrade", "price target", "initiates", "analyst", "rating", "overweight", "underweight"},
    "merger": {"merger", "acquisition", "acquires", "acquired", "takeover", "buyout", "deal"},
    "legal": {"lawsuit", "sued", "settlement", "litigation", "court"},
    "regulatory": {"sec", "fda", "ftc", "regulator", "regulatory", "investigation", "probe", "compliance"},
    "macro": {"fed", "federal reserve", "inflation", "cpi", "jobs report", "gdp", "interest rate", "rate hike", "rate cut"},
}


def classify_category(headline: str, summary: str | None = None) -> str | None:
    text = f"{headline} {summary or ''}".lower()
    best: tuple[str, int] | None = None
    for category, keywords in _CATEGORY_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text)
        if hits and (best is None or hits > best[1]):
            best = (category, hits)
    return best[0] if best else None


# --- reliability (per-source, static) -------------------------------------------

# A small, explicit, editable table — never invented per-article. Unknown
# sources default to a middling 0.5, not 0 (absence of data is not
# evidence of unreliability) and not 1.0 (never assume trust).
_SOURCE_RELIABILITY: dict[str, float] = {
    "benzinga": 0.6,
    "businesswire": 0.75,
    "prnewswire": 0.7,
    "globenewswire": 0.7,
    "reuters": 0.9,
    "bloomberg": 0.9,
    "associated press": 0.9,
    "cnbc": 0.8,
    "marketwatch": 0.75,
    "seeking alpha": 0.55,
    "yahoo finance": 0.65,
}


def source_reliability(source: str) -> float:
    return _SOURCE_RELIABILITY.get(source.strip().lower(), 0.5)


# --- novelty ---------------------------------------------------------------------

def compute_novelty(headline: str, recent_headlines: list[str]) -> float:
    """1.0 = nothing like it seen recently; 0.0 = near-duplicate of a
    recent headline for the same symbol(s). Token-overlap (Jaccard), not
    embeddings — cheap, deterministic, good enough to catch wire-service
    re-publishes of the identical story, which is the common case this
    guards against (see novelty's purpose: distinguishing genuinely new
    information from a restated headline)."""
    if not recent_headlines:
        return 1.0
    current = set(_WORD_RE.findall(headline.lower()))
    if not current:
        return 1.0
    max_overlap = 0.0
    for prior in recent_headlines:
        prior_tokens = set(_WORD_RE.findall(prior.lower()))
        if not prior_tokens:
            continue
        union = current | prior_tokens
        if not union:
            continue
        jaccard = len(current & prior_tokens) / len(union)
        max_overlap = max(max_overlap, jaccard)
    return round(1.0 - max_overlap, 3)


# --- relevance -------------------------------------------------------------------

def compute_relevance(symbol: str, headline: str, symbols: list[str]) -> float:
    """1.0 when the symbol is the clear subject (mentioned in the
    headline, or the only symbol tagged); lower when it's one of several
    co-tagged symbols and not named directly — a story about "tech stocks"
    tagging five tickers is less specifically about any one of them."""
    if symbol.upper() in headline.upper():
        return 1.0
    if len(symbols) <= 1:
        return 0.9
    return round(max(0.3, 1.0 - 0.15 * (len(symbols) - 1)), 3)


# --- impact ------------------------------------------------------------------------

def compute_impact(sentiment_score: float, reliability: float, relevance: float, category: str | None) -> float:
    """0..1 — a simple, explainable combination, never a trained model.
    Category weighting reflects that some story types (earnings, M&A,
    regulatory) tend to move price more than others (analyst notes,
    routine macro commentary) — a documented prior, not a fitted one."""
    category_weight = {
        "earnings": 1.0, "merger": 1.0, "regulatory": 0.9, "legal": 0.8,
        "guidance": 0.85, "analyst": 0.6, "macro": 0.5,
    }.get(category or "", 0.5)
    magnitude = abs(sentiment_score)
    return round(min(1.0, magnitude * reliability * relevance * category_weight * 1.3), 3)


@dataclass
class NewsClassification:
    sentiment: float
    sentiment_label: str
    category: str | None
    reliability: float
    novelty: float
    relevance: float
    impact: float


def classify(
    headline: str,
    summary: str | None,
    source: str,
    symbol: str,
    symbols: list[str],
    recent_headlines: list[str],
) -> NewsClassification:
    sentiment, label = classify_sentiment(headline, summary)
    category = classify_category(headline, summary)
    reliability = source_reliability(source)
    novelty = compute_novelty(headline, recent_headlines)
    relevance = compute_relevance(symbol, headline, symbols)
    impact = compute_impact(sentiment, reliability, relevance, category)
    return NewsClassification(
        sentiment=sentiment, sentiment_label=label, category=category,
        reliability=reliability, novelty=novelty, relevance=relevance, impact=impact,
    )
