"""Paper Trading "Why no trade?" — a read-only diagnostic that answers
"could this account's autonomous trading open a position on this ticker
right now, and if not, exactly why not?"

Deliberately never executes anything: every check here mirrors
`services/paper_trading/autonomous.py`'s own gate order (see that
module's docstring for the authoritative list this must stay in sync
with) but only *reads* state — it never calls `engine.open_position()`,
never mutates the account, and produces the same answer whether or not
NCS has actually fired a BUY signal for this ticker right now. That last
point matters: "why didn't a trade happen" is very often "there is no
actionable signal at all," which this reports as the first, honest gate
rather than skipping straight to gates that only make sense once a
BUY/STRONG_BUY verdict exists.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.paper_trading import PaperTradingAccount
from app.services.data_providers.base import MarketDataProvider
from app.services.paper_trading import engine

# Reusing autonomous.py's own private read helpers (not re-implementing
# "does this account already hold ticker X" / "how many autonomous
# positions are open") deliberately — a second, slightly different
# definition of either check here would be exactly the kind of drift that
# makes a diagnostic panel lie about what the real decision engine does.
from app.services.paper_trading.autonomous import (
    MAX_CONCURRENT_AUTONOMOUS_POSITIONS,
    MAX_QUOTE_STALENESS_SECONDS,
    MIN_SHADOW_CLOSED_SAMPLE,
    MIN_SHADOW_WIN_RATE_PCT,
    _has_any_open_position,
    _open_autonomous_position_count,
)
from app.services.platform_settings import is_autonomous_trading_paused
from app.services.shadow.engine import shadow_stats

_BUY_FAMILY = {"STRONG_BUY", "BUY"}


@dataclass
class GateStatus:
    name: str
    passed: bool
    detail: str


@dataclass
class WhyNoTradeReport:
    ticker: str
    timeframe: str
    market_state: str
    provider: str
    data_mode: str
    data_freshness: str
    ncs_state: str  # confirmed_verdict, or raw_verdict if unconfirmed, or "NO_SIGNAL_YET"
    ncs_fired: bool
    ncs_vetoed: bool
    red_team_result: str  # "PASS" or the joined veto reason(s)
    shadow_sample_size: int
    shadow_win_rate_pct: float | None
    drift_status: str
    risk_gate_passed: bool
    risk_gate_reasons: list[str]
    gates: list[GateStatus] = field(default_factory=list)
    permitted: bool = False
    blockers: list[str] = field(default_factory=list)


def why_no_trade(
    db: Session, account: PaperTradingAccount, ticker: str, timeframe: str, provider: MarketDataProvider,
) -> WhyNoTradeReport:
    from app.services.market_overview import market_status
    from app.services.monitoring.drift import drift_status_label
    from app.services.risk import red_team
    from app.services.risk.engine import evaluate_risk
    from app.services.scoring.scorer import analyze_ticker
    from app.services.signals.ncs import NCS_VERSION, latest_ncs
    from app.services.streaming.service import get_stream_service

    ticker = ticker.upper()
    gates: list[GateStatus] = []
    blockers: list[str] = []

    def gate(name: str, passed: bool, detail: str) -> None:
        gates.append(GateStatus(name, passed, detail))
        if not passed:
            blockers.append(detail)

    analysis = analyze_ticker(ticker, provider=provider)
    health = get_stream_service().health(ticker)
    ncs_row = latest_ncs(db, ticker, timeframe)
    drift_status = drift_status_label(db)

    ncs_state = ncs_row.confirmed_verdict or ncs_row.raw_verdict if ncs_row else "NO_SIGNAL_YET"
    ncs_fired = bool(ncs_row and ncs_row.fired)
    ncs_vetoed = bool(ncs_row and ncs_row.vetoed)
    ncs_version = ncs_row.version if ncs_row else NCS_VERSION

    stats = shadow_stats(db, ticker=ticker, timeframe=timeframe, ncs_version=ncs_version)

    portfolio_open_symbols = {p.ticker_symbol for p in engine.list_open_positions_for_account(account, db)}
    verdict = red_team.review(
        ticker, analysis, db, portfolio_open_symbols=portfolio_open_symbols,
        provider_healthy=not health.get("stale", False),
    )
    red_team_result = "PASS" if not verdict.vetoed else (verdict.reason or "vetoed")

    risk_verdict = evaluate_risk(analysis.confidence_score, analysis.expected_risk_reward, db=db)

    # --- gates, in the exact order autonomous.py's own docstring lists ---
    gate(
        "emergency_stop", not is_autonomous_trading_paused(db),
        "Platform-wide autonomous-trading emergency stop is engaged." if is_autonomous_trading_paused(db)
        else "Emergency stop is not engaged.",
    )
    gate(
        "account_opt_in", account.autonomous_trading_enabled,
        "This account has not opted into autonomous trading." if not account.autonomous_trading_enabled
        else "Account has opted into autonomous trading.",
    )
    has_buy_signal = ncs_fired and not ncs_vetoed and (ncs_row.confirmed_verdict in _BUY_FAMILY if ncs_row else False)
    gate(
        "ncs_signal", has_buy_signal,
        f"No newly-fired, non-vetoed BUY/STRONG_BUY NCS signal right now (current state: {ncs_state})."
        if not has_buy_signal else f"NCS fired {ncs_row.confirmed_verdict} on this closed bar.",  # type: ignore[union-attr]
    )
    gate("red_team", not verdict.vetoed, f"Red-Team veto: {verdict.reason}" if verdict.vetoed else "Red-Team: PASS")
    shadow_ok = stats.count_closed >= MIN_SHADOW_CLOSED_SAMPLE and (stats.win_rate_pct or 0) >= MIN_SHADOW_WIN_RATE_PCT
    gate(
        "shadow_track_record", shadow_ok,
        f"Shadow sample {stats.count_closed}/{MIN_SHADOW_CLOSED_SAMPLE} closed, "
        f"win rate {stats.win_rate_pct if stats.win_rate_pct is not None else 0:.0f}%/{MIN_SHADOW_WIN_RATE_PCT:.0f}% required."
        if not shadow_ok else f"Shadow sample {stats.count_closed} closed, win rate {stats.win_rate_pct:.0f}%.",
    )
    already_open = _has_any_open_position(db, account.id, ticker)
    gate(
        "no_existing_position", not already_open,
        f"Account already holds an open position in {ticker}." if already_open
        else "No existing open position on this ticker.",
    )
    open_count = _open_autonomous_position_count(db, account.id)
    within_limit = open_count < MAX_CONCURRENT_AUTONOMOUS_POSITIONS
    gate(
        "position_limit", within_limit,
        f"{open_count}/{MAX_CONCURRENT_AUTONOMOUS_POSITIONS} concurrent autonomous positions already open."
        if not within_limit else f"{open_count}/{MAX_CONCURRENT_AUTONOMOUS_POSITIONS} concurrent autonomous positions open.",
    )
    gate("risk_gate", risk_verdict.passed, "; ".join(risk_verdict.reasons) if not risk_verdict.passed else "Risk gate: PASS")

    try:
        quote = provider.get_quote(ticker)
        quote_age = (datetime.now(timezone.utc) - quote.timestamp).total_seconds()
        quote_fresh = quote_age <= MAX_QUOTE_STALENESS_SECONDS
        gate(
            "quote_freshness", quote_fresh,
            f"Quote is {quote_age:.0f}s old (max {MAX_QUOTE_STALENESS_SECONDS}s)." if not quote_fresh
            else f"Quote is {quote_age:.0f}s old.",
        )
        data_freshness = f"{quote_age:.0f}s old" if quote_fresh else f"STALE — {quote_age:.0f}s old"
    except Exception as exc:
        gate("quote_freshness", False, f"Quote unavailable: {exc}")
        data_freshness = "unavailable"

    return WhyNoTradeReport(
        ticker=ticker, timeframe=timeframe, market_state=market_status(),
        provider=getattr(provider, "name", "unspecified"), data_mode=getattr(provider, "data_mode", "unspecified"),
        data_freshness=data_freshness, ncs_state=ncs_state, ncs_fired=ncs_fired, ncs_vetoed=ncs_vetoed,
        red_team_result=red_team_result, shadow_sample_size=stats.count_closed, shadow_win_rate_pct=stats.win_rate_pct,
        drift_status=drift_status, risk_gate_passed=risk_verdict.passed, risk_gate_reasons=risk_verdict.reasons,
        gates=gates, permitted=all(g.passed for g in gates), blockers=blockers,
    )
