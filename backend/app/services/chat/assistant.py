"""Conversational AI trading advisor.

Every answer is grounded in the same `StockAnalysis` object the dashboard and
API return for that ticker — the assistant is a narrator over real computed
scores, not a free-floating chatbot. It never asserts certainty: every claim
about the future is phrased as a probability, and refusal/uncertainty is
explicit when data is thin.

Two backends:
- "template": deterministic, fully offline, pattern-matches the question
  against the analysis object. Default — always available, zero cost.
- "llm": sends the analysis as grounding context to an Anthropic model for
  more natural, open-ended answers. Only used if ANTHROPIC_API_KEY is set.
"""
from __future__ import annotations

import json
import re

from app.core.config import get_settings
from app.schemas.stock import StockAnalysis
from app.services.chat.memory import ChatTurn
from app.services.data_providers.factory import get_data_provider
from app.services.scoring.scorer import analyze_ticker

SYSTEM_PROMPT = """You are Ven0X, an OTC micro-cap research assistant embedded in a trading \
platform. You help users evaluate OTC/penny stock setups the platform's AI has already scored.

Hard rules, never break these:
1. NEVER claim certainty about future price movement. Always speak in probabilities \
("there's roughly a 30% modeled probability...", not "this will go up").
2. NEVER answer from memory when live data is required. Any quantitative claim about a \
stock (price, score, probability, risk flag, news) MUST come from calling a tool in this \
conversation. If you did not call a tool for it, you may not state it as fact.
3. Always mention at least one concrete risk or invalidation condition when discussing a \
potential trade.
4. If asked to guarantee a result, predict an exact future price, or act as a fiduciary, \
decline and explain that you provide probabilistic research only, not financial advice.
5. Keep answers concise unless the user asks for depth, and always explain the reasoning \
behind the answer, not just the conclusion.
6. OTC micro-caps are high risk: manipulation, dilution, and illiquidity are common. \
Surface these risks proactively when relevant, even if not asked.
7. End every substantive answer by explicitly separating what you said into:
   - Facts: values retrieved from tools (computed by the platform from market data)
   - Predictions: model probability estimates — statistical, calibrated, never guaranteed
   - Assumptions: modeling assumptions or simplifications your answer relies on
   - Missing: information that was unavailable and would change the answer if known
"""


def _detect_ticker(message: str, known_symbols: list[str], fallback: str | None) -> str | None:
    cashtag = re.search(r"\$([A-Za-z]{2,6})\b", message)
    if cashtag:
        return cashtag.group(1).upper()
    upper_tokens = re.findall(r"\b[A-Z]{2,6}\b", message)
    for token in upper_tokens:
        if token in known_symbols:
            return token
    return fallback


def resolve_ticker(message: str, current_ticker: str | None) -> str | None:
    provider = get_data_provider()
    known = [t.symbol for t in provider.get_universe()]
    return _detect_ticker(message, known, current_ticker)


def generate_reply(
    message: str,
    ticker: str | None,
    history: list[ChatTurn],
    db=None,
) -> tuple[str, str | None]:
    """Returns (reply_text, resolved_ticker)."""
    resolved_ticker = resolve_ticker(message, ticker)
    analysis = None
    if resolved_ticker:
        try:
            analysis = analyze_ticker(resolved_ticker)
        except Exception:
            analysis = None

    settings = get_settings()
    if settings.chat_backend == "llm" and settings.anthropic_api_key:
        reply = _llm_reply(message, resolved_ticker, history, db)
        if reply is not None:
            return reply, resolved_ticker

    return _template_reply(message, analysis), resolved_ticker


def _llm_reply(message: str, resolved_ticker: str | None, history: list[ChatTurn], db=None) -> str | None:
    """Agentic tool-calling loop: the model must fetch live data through the
    tool registry before making quantitative claims — it receives no
    pre-baked analysis blob, so answering 'from memory' has nothing to
    answer from.
    """
    try:
        import anthropic

        from app.services.chat.tools import anthropic_tool_schemas, execute_tool

        settings = get_settings()
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        provider = get_data_provider()

        messages: list[dict] = []
        for turn in history[-10:]:
            role = "user" if turn.role == "user" else "assistant"
            messages.append({"role": role, "content": turn.content})
        context_note = f"(Session ticker context: {resolved_ticker})\n" if resolved_ticker else ""
        messages.append({"role": "user", "content": context_note + message})

        for _ in range(6):  # bounded tool-use loop
            response = client.messages.create(
                model=settings.chat_model,
                max_tokens=900,
                system=SYSTEM_PROMPT,
                tools=anthropic_tool_schemas(),
                messages=messages,
            )
            if response.stop_reason != "tool_use":
                return "".join(block.text for block in response.content if hasattr(block, "text"))

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = execute_tool(block.name, dict(block.input), db, provider)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str)[:20_000],
                        }
                    )
            messages.append({"role": "user", "content": tool_results})

        return "I hit the tool-call limit for one answer — please ask a narrower question."
    except Exception:
        return None


def _epistemic_footer(a: StockAnalysis) -> str:
    """Every substantive answer separates what kind of statement it made.
    The template backend computes (never asserts from memory): all numbers
    above were retrieved from the live scoring pipeline in this turn.
    """
    missing = []
    if not a.manipulation_flags and a.manipulation_risk > 30:
        missing.append("named manipulation pattern (only statistical anomaly available)")
    if a.sentiment_score == 50.0:
        missing.append("news sentiment classifier (neutral placeholder in use)")
    missing_text = "; ".join(missing) if missing else "none material to this answer"
    as_of = a.as_of.strftime("%Y-%m-%d %H:%M UTC") if a.as_of else "unknown time"
    return (
        f"\n\n— Facts: scores/prices computed from '{a.data_source}' data ({a.data_mode}) at {as_of} for {a.ticker}. "
        f"Predictions: all probabilities are calibrated model estimates, not guarantees. "
        f"Assumptions: OTC execution costs (spread/slippage) match recent history; horizons are trading days. "
        f"Missing: {missing_text}."
    )


def _template_reply(message: str, analysis: StockAnalysis | None) -> str:
    if analysis is None:
        return (
            "I don't have a ticker in context yet. Mention a symbol (e.g. \"$AXNT\" or \"what about AXNT\") "
            "and I'll pull up its current AI analysis — scores, risks, and probability-based outlook."
        )
    return _template_reply_core(message, analysis) + _epistemic_footer(analysis)


def _template_reply_core(message: str, analysis: StockAnalysis) -> str:
    q = message.lower()
    a = analysis

    if any(k in q for k in ["should i buy", "worth buying", "good buy", "buy it"]):
        return (
            f"{a.ticker} currently scores {a.overall_ai_score:.0f}/100 overall with {a.confidence_score:.0f}% model "
            f"confidence. Modeled probability of touching +10% within {a.estimated_holding_period_days} trading days "
            f"is about {_prob_at(a, a.estimated_holding_period_days, 10)*100:.0f}%, versus a "
            f"{a.probability_downside_before_upside*100:.0f}% chance of drawing down before any upside. "
            f"Manipulation risk is {a.manipulation_risk:.0f}/100. This isn't a buy/sell instruction — it's a "
            f"probability-weighted setup for you to size and manage against your own risk tolerance."
        )

    if any(k in q for k in ["biggest risk", "risks", "risky"]):
        flags = a.manipulation_flags[:3]
        flag_text = " ".join(f.reason for f in flags) if flags else "No major manipulation flags are currently active."
        return (
            f"Manipulation risk is scored {a.manipulation_risk:.0f}/100 for {a.ticker}. {flag_text} "
            f"Separately, liquidity is {a.liquidity_score:.0f}/100 — thin liquidity can make both entries and exits "
            f"costlier than the quoted spread suggests."
        )

    if any(k in q for k in ["catalyst", "coming up", "upcoming"]):
        return (
            f"Catalyst score for {a.ticker} is {a.catalyst_score:.0f}/100, reflecting recent news flow and corporate "
            f"actions. This score decays as news ages, so treat it as a snapshot rather than a forward calendar — "
            f"check the news feed for specifics."
        )

    if any(k in q for k in ["how confident", "confidence"]):
        return (
            f"Model confidence for {a.ticker} is {a.confidence_score:.0f}/100. This blends how much the three "
            f"underlying models (LightGBM, XGBoost, CatBoost) agree with each other, data quality/history length, "
            f"liquidity, and manipulation risk. Lower confidence means treat the probabilities as rougher estimates."
        )

    if any(k in q for k in ["invalidate", "invalidat", "wrong"]):
        return (
            f"This setup would be invalidated by: price closing below the stop loss (${a.stop_loss:.4f}), a new "
            f"dilutive offering or reverse split announcement, a jump in manipulation-risk flags (e.g. a promotional "
            f"campaign or delinquent filing), or a sustained drop in relative volume/liquidity below current levels."
        )

    if any(k in q for k in ["similar setup", "similar before", "happened before"]):
        return (
            "I don't yet have enough logged historical predictions with realized outcomes for this exact ticker to "
            "cite specific past analogues — that comparison improves as the platform accumulates prediction/outcome "
            "history. In aggregate, the backtest engine's win rate and expectancy for this style of setup are "
            "available on the Backtest page."
        )

    if any(k in q for k in ["position size", "how much", "allocation"]):
        return (
            f"Suggested maximum allocation for {a.ticker} is {a.max_allocation_pct:.2f}% of portfolio, scaled down "
            f"for manipulation risk ({a.manipulation_risk:.0f}/100) and liquidity ({a.liquidity_score:.0f}/100). "
            f"This is a ceiling, not a target — many traders should size smaller, especially on OTC illiquid names."
        )

    if any(k in q for k in ["probability of success", "chance", "odds"]):
        rows = "; ".join(
            f"{p.horizon_days}d: +5% {p.prob_up_5*100:.0f}%, +10% {p.prob_up_10*100:.0f}%, +20% {p.prob_up_20*100:.0f}%"
            for p in a.probability_matrix
        )
        return f"Modeled probabilities for {a.ticker} by horizon — {rows}. These are statistical estimates, not guarantees."

    if any(k in q for k in ["why do you like", "why like", "bullish"]):
        bullish = [f for f in a.top_factors if f.direction == "bullish"]
        if not bullish:
            return f"There isn't a strong bullish case for {a.ticker} right now — the top factors currently skew bearish/neutral."
        return f"For {a.ticker}, the strongest supporting factors are: " + ", ".join(f.label for f in bullish[:4]) + "."

    if any(k in q for k in ["avoid", "stay away", "pass on"]):
        bearish = [f for f in a.top_factors if f.direction == "bearish"]
        reasons = ", ".join(f.label for f in bearish[:3]) if bearish else "no single dominant factor"
        return (
            f"I'd weigh avoiding {a.ticker} if you're risk-averse to: {reasons}, and a manipulation-risk score of "
            f"{a.manipulation_risk:.0f}/100. {a.explanation}"
        )

    return a.explanation


def _prob_at(a: StockAnalysis, horizon_days: int, threshold: int) -> float:
    for p in a.probability_matrix:
        if p.horizon_days == horizon_days:
            return {5: p.prob_up_5, 10: p.prob_up_10, 20: p.prob_up_20}[threshold]
    return 0.0
