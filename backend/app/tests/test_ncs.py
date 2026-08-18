"""Nexora Conviction Signal (NCS) — non-repainting, confirmation, cooldown,
veto display, and the closed-bars-only guarantee.
"""
from datetime import timedelta

from app.db.models.ncs_signal import NcsSignal
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.signals.ncs import (
    NCS_VERSION,
    NcsInputs,
    NcsInsufficientData,
    RedTeamVerdict,
    _bucket,
    compute_ncs,
    evaluate_ncs,
)

SYMBOL = "AAPL"  # one of the canonical 20 — MockOTCProvider has a real synthetic profile for it


def _seed_prior_row(db, bar_ts, raw_verdict, confirmed_verdict=None, fired=False):
    row = NcsSignal(
        ticker_symbol=SYMBOL, timeframe="1D", bar_ts=bar_ts,
        raw_verdict=raw_verdict, confirmed_verdict=confirmed_verdict, fired=fired,
        composite_score=0.3, confidence_pct=60.0, risk_score=20.0, explanation="seed",
        components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
        data_source="mock", data_mode="synthetic",
    )
    db.add(row)
    db.commit()
    return row


def test_computes_a_real_verdict_with_full_component_breakdown(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")

    assert c.raw_verdict in ("STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL")
    assert 0 <= c.confidence_pct <= 100
    assert 0 <= c.risk_score <= 100
    assert len(c.components) == 9
    assert c.bar_ts.tzinfo is not None  # always timezone-aware, per platform convention

    # The persisted row (evaluate_ncs) is what actually stamps the version.
    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")
    assert row.version == NCS_VERSION


def test_first_ever_evaluation_is_never_confirmed_or_fired(db_session):
    # Confirmation requires TWO consecutive closed bars agreeing — a
    # symbol's very first-ever NCS row has nothing to agree with yet.
    provider = MockOTCProvider()
    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")
    assert row.confirmed_verdict is None
    assert row.fired is False


def test_never_repaints_a_bar_already_evaluated(db_session):
    provider = MockOTCProvider()
    first = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")
    second = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")

    assert first.id == second.id  # same row returned, not a new one
    assert first.bar_ts == second.bar_ts
    assert db_session.query(NcsSignal).filter_by(ticker_symbol=SYMBOL, timeframe="1D").count() == 1


def test_confirms_only_when_two_consecutive_closed_bars_agree(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    same_bucket = "BUY" if _bucket(c.raw_verdict) == "BUY" else "SELL" if _bucket(c.raw_verdict) == "SELL" else "NEUTRAL"
    prior_verdict = {"BUY": "BUY", "SELL": "SELL", "NEUTRAL": "NEUTRAL"}[same_bucket]

    _seed_prior_row(db_session, c.bar_ts - timedelta(days=1), prior_verdict)
    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")

    assert _bucket(row.raw_verdict) == same_bucket
    assert row.confirmed_verdict == row.raw_verdict


def test_does_not_confirm_when_the_prior_bar_disagrees(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    # Seed a prior row in a DIFFERENT bucket than today's.
    opposite = "SELL" if bucket != "SELL" else "BUY"
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=1), opposite)

    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D")
    assert row.confirmed_verdict is None
    assert row.fired is False


def test_fires_on_a_fresh_confirmed_non_neutral_bucket_with_no_prior_cooldown(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket == "NEUTRAL":
        return  # nothing to fire — a neutral bucket never produces a marker by design
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=1), c.raw_verdict)

    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D", cooldown_minutes=60)
    assert row.confirmed_verdict is not None
    assert row.fired is True


def test_cooldown_blocks_a_second_fire_of_the_same_bucket(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket == "NEUTRAL":
        return
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=2), c.raw_verdict)
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=1), c.raw_verdict, confirmed_verdict=c.raw_verdict, fired=True)

    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D", cooldown_minutes=60 * 24 * 30)  # 30-day cooldown
    assert row.confirmed_verdict is not None  # still confirmed...
    assert row.fired is False  # ...but not marker-worthy again so soon


def test_cooldown_elapsed_allows_a_new_fire_of_the_same_bucket(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket == "NEUTRAL":
        return
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=10), c.raw_verdict)
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=9), c.raw_verdict, confirmed_verdict=c.raw_verdict, fired=True)

    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D", cooldown_minutes=60)  # 1h cooldown, long elapsed
    assert row.fired is True


def test_red_team_veto_never_rewrites_the_raw_verdict_but_is_displayed_distinctly(db_session):
    provider = MockOTCProvider()
    inputs = NcsInputs(red_team_veto=RedTeamVerdict(vetoed=True, reason="correlated exposure too high"))
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D", inputs=inputs)

    assert c.vetoed is True
    assert c.veto_reason == "correlated exposure too high"
    assert c.raw_verdict in ("STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL")  # never forced to NEUTRAL
    assert "correlated exposure too high" in c.explanation
    assert "Vetoed" in c.explanation


def test_a_vetoed_signal_never_fires_even_if_confirmed(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    bucket = _bucket(c.raw_verdict)
    if bucket == "NEUTRAL":
        return
    _seed_prior_row(db_session, c.bar_ts - timedelta(days=1), c.raw_verdict)

    inputs = NcsInputs(red_team_veto=RedTeamVerdict(vetoed=True, reason="risk desk override"))
    row = evaluate_ncs(SYMBOL, provider, db_session, timeframe="1D", inputs=inputs)
    assert row.vetoed is True
    assert row.fired is False  # a chart signal is never automatically a paper order — vetoed doubly so


def test_missing_optional_inputs_are_reported_honestly_not_faked_neutral(db_session):
    provider = MockOTCProvider()
    c = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    news = next(x for x in c.components if x["name"] == "news_sentiment")
    strategy = next(x for x in c.components if x["name"] == "strategy_agreement")
    portfolio = next(x for x in c.components if x["name"] == "portfolio_risk")

    assert news["weight"] == 0.0 and "not available" not in news["detail"].lower() and "no live news" in news["detail"].lower()
    assert strategy["weight"] == 0.0
    assert portfolio["weight"] == 0.0 and "not provided" in portfolio["detail"].lower()


def test_portfolio_context_dampens_conviction_for_an_already_held_symbol(db_session):
    provider = MockOTCProvider()
    without = compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    with_position = compute_ncs(
        SYMBOL, provider, db_session, timeframe="1D", inputs=NcsInputs(portfolio_open_symbols={SYMBOL})
    )
    portfolio_component = next(x for x in with_position.components if x["name"] == "portfolio_risk")
    assert portfolio_component["score"] < 0
    assert with_position.risk_score >= without.risk_score - 1e-9


def test_insufficient_closed_bars_raises_instead_of_fabricating_a_verdict(db_session, monkeypatch):
    import pandas as pd

    provider = MockOTCProvider()
    monkeypatch.setattr(
        "app.services.signals.ncs.bars_for_timeframe",
        lambda *a, **k: pd.DataFrame({"open": [1, 2], "high": [1, 2], "low": [1, 2], "close": [1, 2], "volume": [1, 2]}),
    )
    try:
        compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
        assert False, "expected NcsInsufficientData"
    except NcsInsufficientData as exc:
        assert "closed bars" in str(exc).lower()


def test_never_computes_from_the_still_forming_intraday_bar(db_session, monkeypatch):
    """The core non-repaint guarantee for intraday timeframes: NCS must
    call bars_for_timeframe with closed_only=True, never the default that
    includes the streaming service's in-progress bar."""
    captured = {}
    provider = MockOTCProvider()

    import app.services.signals.ncs as ncs_module
    real_bars_for_timeframe = ncs_module.bars_for_timeframe

    def spy(symbol, provider_, timeframe, closed_only=False):
        captured["closed_only"] = closed_only
        return real_bars_for_timeframe(symbol, provider_, timeframe, closed_only=closed_only)

    monkeypatch.setattr(ncs_module, "bars_for_timeframe", spy)
    try:
        compute_ncs(SYMBOL, provider, db_session, timeframe="1D")
    except NcsInsufficientData:
        pass  # the assertion below is what this test actually checks
    assert captured["closed_only"] is True


# ---------- API -----------------------------------------------------------

def test_evaluate_ncs_api_returns_a_real_verdict(client):
    res = client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["raw_verdict"] in ("STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL")
    assert body["ticker"] == SYMBOL
    assert body["timeframe"] == "1D"
    assert 0 <= body["confidence_pct"] <= 100
    assert 0 <= body["risk_score"] <= 100
    assert body["vetoed"] is False
    assert isinstance(body["components"], list) and len(body["components"]) == 9


def test_evaluate_ncs_api_is_idempotent_for_the_same_closed_bar(client):
    first = client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D").json()
    second = client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D").json()
    assert first["id"] == second["id"]
    assert first["bar_ts"] == second["bar_ts"]


def test_current_ncs_api_reports_no_signal_yet_before_any_evaluation(client):
    res = client.get("/api/v1/stream/ZNCSNEW/ncs?timeframe=1D")
    assert res.status_code == 200
    assert res.json()["raw_verdict"] == "NO_SIGNAL_YET"


def test_current_ncs_api_returns_the_latest_persisted_row(client):
    evaluated = client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D").json()
    current = client.get(f"/api/v1/stream/{SYMBOL}/ncs?timeframe=1D").json()
    assert current["id"] == evaluated["id"]


def test_ncs_history_api_lists_persisted_rows(client):
    client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D")
    res = client.get(f"/api/v1/stream/{SYMBOL}/ncs-history?timeframe=1D")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == SYMBOL
    assert len(body["signals"]) >= 1


def test_evaluate_ncs_api_never_touches_any_broker_order_endpoint(client):
    # Nexora Internal Paper only — a chart signal is never automatically a
    # paper order, and NCS must never itself call into a real broker.
    res = client.post(f"/api/v1/stream/{SYMBOL}/evaluate-ncs?timeframe=1D")
    assert res.status_code == 200
    # No paper position should exist as a side effect of evaluating a signal.
    positions = client.get("/api/v1/paper-trading/positions?status=open").json()
    assert positions == [] or all(p["ticker_symbol"] != SYMBOL for p in positions)
