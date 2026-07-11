"""Domain analyst agents — the evidence gatherers.

Each analyst owns exactly one lens and may only speak about it:

- TechnicalAnalyst    price/volume structure (momentum, trend, extension)
- FundamentalAnalyst  solvency, dilution, filings, profitability
- SentimentAnalyst    tone of coverage and its trustworthiness
- NewsAnalyst         catalysts: what's actually happening at the company

Analysts emit Evidence, never conclusions (see evidence.py). Thresholds are
deliberately explicit constants in the claims so every statement is
verifiable against the raw features it cites.
"""
from __future__ import annotations

from app.services.agents.context import DeliberationContext
from app.services.agents.evidence import BEARISH, BULLISH, NEUTRAL, Evidence
from app.services.features.fundamental import _runway_months


class TechnicalAnalyst:
    name = "technical_analyst"

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        tech = ctx.tech
        out: list[Evidence] = []
        rsi = tech["rsi_14"]

        if rsi < 30:
            out.append(Evidence(self.name, f"RSI at {rsi:.0f} — deeply oversold; mean-reversion setups favor upside", BULLISH, 0.6, "technical.rsi_14", rsi))
        elif rsi < 55:
            out.append(Evidence(self.name, f"RSI at {rsi:.0f} — recovering momentum without being stretched", BULLISH, 0.4, "technical.rsi_14", rsi))
        elif rsi <= 70:
            out.append(Evidence(self.name, f"RSI at {rsi:.0f} — strong but nearing overbought", NEUTRAL, 0.2, "technical.rsi_14", rsi))
        else:
            out.append(Evidence(self.name, f"RSI at {rsi:.0f} — overbought; late entries are chasing", BEARISH, 0.5, "technical.rsi_14", rsi))

        hist = tech["macd_histogram"]
        out.append(
            Evidence(
                self.name,
                f"MACD histogram {'positive' if hist > 0 else 'negative'} ({hist:+.4f}) — short-term momentum {'building' if hist > 0 else 'fading'}",
                BULLISH if hist > 0 else BEARISH,
                0.4,
                "technical.macd_histogram",
                hist,
            )
        )

        adx = tech["adx"]
        if adx > 25:
            direction = BULLISH if hist > 0 else BEARISH
            out.append(Evidence(self.name, f"ADX at {adx:.0f} — a real trend is in force (direction per momentum)", direction, 0.3, "technical.adx", adx))

        sma20 = tech["sma_20"]
        if sma20:
            vs_sma = (tech["price"] / sma20 - 1) * 100
            if vs_sma > 5:
                out.append(Evidence(self.name, f"Price {vs_sma:.0f}% above its 20-day average — buyers in control", BULLISH, 0.3, "technical.price_vs_sma20", vs_sma))
            elif vs_sma < -5:
                out.append(Evidence(self.name, f"Price {abs(vs_sma):.0f}% below its 20-day average — supply still dominant", BEARISH, 0.3, "technical.price_vs_sma20", vs_sma))

        rvol = tech["relative_volume"]
        if rvol > 2:
            out.append(
                Evidence(
                    self.name,
                    f"Relative volume {rvol:.1f}x — unusual participation confirms the move",
                    BULLISH if hist > 0 else BEARISH,
                    0.4,
                    "technical.relative_volume",
                    rvol,
                )
            )
        return out


class FundamentalAnalyst:
    name = "fundamental_analyst"

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        fund = ctx.fundamentals
        out: list[Evidence] = []

        runway = _runway_months(fund)
        if runway >= 18:
            out.append(Evidence(self.name, f"~{runway:.0f} months of cash runway — no imminent financing pressure", BULLISH, 0.4, "fundamental.runway_months", runway))
        elif runway < 6:
            out.append(Evidence(self.name, f"~{runway:.0f} months of cash runway — a dilutive raise is likely soon", BEARISH, 0.7, "fundamental.runway_months", runway))

        dilution = fund.dilution_12m_pct
        if dilution > 50:
            out.append(Evidence(self.name, f"Share count grew {dilution:.0f}% in 12 months — heavy, possibly toxic dilution", BEARISH, 0.9, "fundamental.dilution_12m_pct", dilution))
        elif dilution > 20:
            out.append(Evidence(self.name, f"Share count grew {dilution:.0f}% in 12 months — meaningful dilution headwind", BEARISH, 0.6, "fundamental.dilution_12m_pct", dilution))
        elif dilution < 0:
            out.append(Evidence(self.name, f"Share count shrank {abs(dilution):.0f}% — rare capital discipline for OTC", BULLISH, 0.5, "fundamental.dilution_12m_pct", dilution))

        if fund.filing_delinquent:
            out.append(Evidence(self.name, "Issuer is delinquent on required SEC filings — information risk is elevated", BEARISH, 0.8, "fundamental.filing_delinquent"))
        if fund.going_concern_flag:
            out.append(Evidence(self.name, "Auditor has expressed going-concern doubt", BEARISH, 0.7, "fundamental.going_concern"))

        if fund.revenue_ttm > 0:
            margin = fund.net_income_ttm / fund.revenue_ttm
            if margin > 0:
                out.append(Evidence(self.name, f"Actually profitable (net margin {margin:.0%}) — unusual quality for this market", BULLISH, 0.5, "fundamental.net_margin", margin))

        if not out:
            out.append(Evidence(self.name, "No fundamental red flags, but also no demonstrated fundamental strength", NEUTRAL, 0.2, "fundamental.overall"))
        return out


class SentimentAnalyst:
    name = "sentiment_analyst"

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        out: list[Evidence] = []
        score = ctx.analysis.sentiment_score
        if score >= 60:
            out.append(Evidence(self.name, f"Coverage tone is positive (sentiment {score:.0f}/100)", BULLISH, 0.3, "sentiment.score", score))
        elif score <= 40:
            out.append(Evidence(self.name, f"Coverage tone is negative (sentiment {score:.0f}/100)", BEARISH, 0.3, "sentiment.score", score))
        else:
            out.append(Evidence(self.name, f"Coverage tone is mixed (sentiment {score:.0f}/100)", NEUTRAL, 0.2, "sentiment.score", score))

        if ctx.news:
            promo_ratio = sum(n.is_promotional for n in ctx.news) / len(ctx.news)
            if promo_ratio >= 0.3:
                out.append(
                    Evidence(
                        self.name,
                        f"{promo_ratio:.0%} of recent coverage looks like paid promotion — positive tone is not trustworthy",
                        BEARISH,
                        0.6,
                        "sentiment.promotional_ratio",
                        promo_ratio,
                    )
                )
        return out


class NewsAnalyst:
    name = "news_analyst"

    _NEGATIVE_MARKERS = ("offering", "dilut", "going concern", "reverse split", "delist")

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        out: list[Evidence] = []
        catalyst = ctx.analysis.catalyst_score

        if not ctx.news:
            out.append(Evidence(self.name, "No recent news flow at all — nothing to drive a move except speculation", NEUTRAL, 0.3, "news.coverage_count", 0))
            return out

        if catalyst >= 60:
            out.append(Evidence(self.name, f"Active catalyst environment (catalyst score {catalyst:.0f}/100) — recent news is the kind that moves price", BULLISH, 0.5, "news.catalyst_score", catalyst))
        elif catalyst <= 30:
            out.append(Evidence(self.name, f"Catalyst-poor tape (score {catalyst:.0f}/100) — no identifiable driver for upside", BEARISH, 0.3, "news.catalyst_score", catalyst))

        negative_hits = [
            n.headline for n in ctx.news
            if any(marker in n.headline.lower() for marker in self._NEGATIVE_MARKERS)
        ]
        if negative_hits:
            out.append(
                Evidence(
                    self.name,
                    f"Structurally negative headlines present ({len(negative_hits)}): e.g. \"{negative_hits[0][:90]}\"",
                    BEARISH,
                    0.5,
                    "news.negative_headlines",
                    float(len(negative_hits)),
                )
            )
        return out
