"""Oversight agents — the ones that argue with the analysts.

- ManipulationDetective  converts every active manipulation flag into
                         adversarial evidence; its whole job is suspicion
- ContrarianAnalyst      receives the bundle *after* the analysts and must
                         produce the strongest case AGAINST the emerging
                         consensus — the institutionalized devil's advocate
- RiskManager            translates everything into loss terms: what can go
                         wrong, how fast, and what invalidates the setup
- PortfolioManager       turns a verdict into position discipline: sizing,
                         horizon, and the exit structure
"""
from __future__ import annotations

from app.services.agents.context import DeliberationContext
from app.services.agents.evidence import BEARISH, BULLISH, NEUTRAL, Evidence, EvidenceBundle


class ManipulationDetective:
    name = "manipulation_detective"

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        out: list[Evidence] = []
        for flag in ctx.analysis.manipulation_flags:
            out.append(
                Evidence(
                    self.name,
                    flag.reason,
                    BEARISH,
                    min(flag.severity / 100, 1.0),
                    f"manipulation.{flag.code}",
                    flag.severity,
                )
            )
        risk = ctx.analysis.manipulation_risk
        if not out and risk < 20:
            out.append(Evidence(self.name, f"No manipulation patterns detected (risk {risk:.0f}/100)", NEUTRAL, 0.2, "manipulation.overall", risk))
        elif risk >= 50 and not ctx.analysis.manipulation_flags:
            out.append(
                Evidence(
                    self.name,
                    f"Statistical anomaly detector is elevated ({risk:.0f}/100) even without a named pattern — behavior is abnormal vs. this stock's own history",
                    BEARISH,
                    risk / 100 * 0.7,
                    "manipulation.anomaly",
                    risk,
                )
            )
        return out


class ContrarianAnalyst:
    """Runs AFTER the evidence stage, sees the emerging consensus, and is
    obligated to attack it. If the bundle leans bullish it hunts for the
    bear case; if bearish, the bull case. It must always return something —
    'no contradictory evidence found' is itself a recorded finding.
    """

    name = "contrarian_analyst"

    def run(self, ctx: DeliberationContext, bundle: EvidenceBundle) -> list[Evidence]:
        net = bundle.net_score()
        out: list[Evidence] = []

        if net >= 0:  # consensus is bullish/neutral → build the bear case
            tech, analysis = ctx.tech, ctx.analysis
            if tech["pct_from_52w_high"] > -5:
                out.append(Evidence(self.name, "Price is within 5% of its 52-week high — the easy move may already be over", BEARISH, 0.4, "contrarian.at_highs", tech["pct_from_52w_high"]))
            sma20 = tech["sma_20"]
            if sma20 and (tech["price"] / sma20 - 1) * 100 > 20:
                out.append(Evidence(self.name, "Price stretched >20% above its 20-day mean — snap-back risk is high", BEARISH, 0.5, "contrarian.overextended"))
            if analysis.probability_downside_before_upside > 0.5:
                out.append(Evidence(self.name, f"Model says {analysis.probability_downside_before_upside:.0%} chance of drawdown BEFORE any upside — entries will likely see red first", BEARISH, 0.5, "contrarian.downside_first", analysis.probability_downside_before_upside))
            if analysis.liquidity_score < 40:
                out.append(Evidence(self.name, f"Liquidity {analysis.liquidity_score:.0f}/100 — even a correct call may be unexitable at fair prices", BEARISH, 0.5, "contrarian.illiquidity", analysis.liquidity_score))
            if any(n.is_promotional for n in ctx.news):
                out.append(Evidence(self.name, "Promotional coverage exists — who is being paid to make you bullish, and why now?", BEARISH, 0.5, "contrarian.promotion"))
        else:  # consensus is bearish → build the bull case
            tech, analysis = ctx.tech, ctx.analysis
            if tech["rsi_14"] < 30:
                out.append(Evidence(self.name, f"RSI {tech['rsi_14']:.0f} — capitulation territory; the sellers may be exhausted", BULLISH, 0.4, "contrarian.oversold", tech["rsi_14"]))
            if analysis.catalyst_score > 60:
                out.append(Evidence(self.name, f"A real catalyst environment ({analysis.catalyst_score:.0f}/100) can invalidate the bear case fast", BULLISH, 0.4, "contrarian.catalyst", analysis.catalyst_score))
            if (ctx.meta.insider_ownership_pct or 0) > 30:
                out.append(Evidence(self.name, f"Insiders hold {ctx.meta.insider_ownership_pct:.0f}% — management is aligned with a recovery", BULLISH, 0.3, "contrarian.insider_alignment", ctx.meta.insider_ownership_pct))

        # A strong consensus must ALWAYS face at least one opposing argument.
        # When no feature-specific counter-case exists, the probability
        # distribution itself supplies an honest one — the numbers always do.
        needed = BEARISH if net >= 0 else BULLISH
        if abs(net) >= 0.2 and not any(e.direction == needed for e in out):
            primary = next(
                (p for p in ctx.analysis.probability_matrix
                 if p.horizon_days == ctx.analysis.estimated_holding_period_days),
                ctx.analysis.probability_matrix[0],
            )
            if needed == BEARISH:
                out.append(Evidence(
                    self.name,
                    f"Even the bullish consensus only models a {primary.prob_up_10:.0%} chance of +10% — most simulated paths never reach the target",
                    BEARISH, 0.3, "contrarian.base_rates", primary.prob_up_10,
                ))
            else:
                out.append(Evidence(
                    self.name,
                    f"The bear case is probable, not certain — {primary.prob_up_10:.0%} of modeled paths still touch +10% within the horizon",
                    BULLISH, 0.3, "contrarian.base_rates", primary.prob_up_10,
                ))

        if not out:
            out.append(Evidence(self.name, "No material contradictory evidence found beyond baseline OTC risk — recorded as a finding, not assumed", NEUTRAL, 0.2, "contrarian.none_found"))
        return out


class RiskManager:
    name = "risk_manager"

    def run(self, ctx: DeliberationContext) -> tuple[list[Evidence], dict, list[str]]:
        a = ctx.analysis
        out: list[Evidence] = []

        composite = (
            a.manipulation_risk * 0.35
            + (100 - a.liquidity_score) * 0.25
            + a.probability_downside_before_upside * 100 * 0.25
            + min(ctx.tech["atr_pct"] * 4, 100) * 0.15
        )
        level = "severe" if composite >= 70 else "high" if composite >= 50 else "elevated" if composite >= 30 else "moderate"

        out.append(Evidence(self.name, f"Composite risk level: {level} ({composite:.0f}/100) — blending manipulation, liquidity, drawdown-first odds and volatility", BEARISH if composite >= 50 else NEUTRAL, min(composite / 100, 1.0), "risk.composite", composite))
        if ctx.tech["atr_pct"] > 8:
            out.append(Evidence(self.name, f"Daily ATR is {ctx.tech['atr_pct']:.0f}% of price — position swings will be violent; size accordingly", BEARISH, 0.4, "risk.volatility", ctx.tech["atr_pct"]))

        invalidations = [
            f"A close below the stop level (${a.stop_loss:.4f})",
            "Announcement of a dilutive offering, convertible financing, or reverse split",
            "A new manipulation flag activating (promotional campaign, wash-trading signature)",
            f"Liquidity drying up below current levels (score {a.liquidity_score:.0f}/100)",
        ]
        metrics = {
            "composite_risk": round(composite, 1),
            "risk_level": level,
            "max_allocation_pct": a.max_allocation_pct,
            "downside_before_upside": a.probability_downside_before_upside,
        }
        return out, metrics, invalidations


class PortfolioManager:
    name = "portfolio_manager"

    def position_guidance(self, ctx: DeliberationContext, conviction: float) -> dict:
        a = ctx.analysis
        # Conviction scales the ceiling down, never up — the risk-derived
        # allocation cap is a hard limit.
        scaled = max(round(a.max_allocation_pct * max(conviction, 0.25), 2), 0.25)
        return {
            "max_allocation_pct": min(scaled, a.max_allocation_pct),
            "entry_zone": [a.suggested_entry_zone_low, a.suggested_entry_zone_high],
            "stop_loss": a.stop_loss,
            "take_profits": [a.take_profit_1, a.take_profit_2, a.take_profit_3],
            "holding_period_days": a.estimated_holding_period_days,
            "expected_risk_reward": a.expected_risk_reward,
        }
