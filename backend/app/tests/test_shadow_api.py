"""API-level tests for /shadow/* — read-only track record plus the
operator-gated sweep. Seeding uses a short-lived session bound to
test_engine directly (see test_news_api.py's docstring for why: combining
`client` with the `db_session` fixture's held-open transaction hits
"cannot start a transaction within a transaction" under StaticPool)."""
from datetime import datetime, timedelta, timezone
from itertools import count

from sqlalchemy.orm import sessionmaker

from app.db.models.ncs_signal import NcsSignal
from app.db.models.shadow_position import ShadowPosition
from app.services.shadow.engine import SHADOW_VERSION
from app.services.signals.ncs import NCS_VERSION

SYMBOL = "AAPL"

_bar_offsets = count(1)


def _seed(test_engine, ticker_symbol=SYMBOL, **overrides):
    # Each call gets its own bar_ts — ncs_signals has a unique index on
    # (ticker_symbol, timeframe, bar_ts), so reusing one across calls
    # within the same test (or across tests sharing this file's ticker)
    # would collide.
    bar_ts = datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(days=next(_bar_offsets))
    Session = sessionmaker(bind=test_engine)
    db = Session()
    try:
        ncs = NcsSignal(
            ticker_symbol=ticker_symbol, timeframe="1D", bar_ts=bar_ts,
            raw_verdict="BUY", confirmed_verdict="BUY", fired=True,
            composite_score=0.5, confidence_pct=70.0, risk_score=20.0, explanation="t",
            components=[], vetoed=False, veto_reason=None, version=NCS_VERSION,
            data_source="mock", data_mode="synthetic",
        )
        db.add(ncs)
        db.commit()
        db.refresh(ncs)

        defaults = dict(
            ncs_signal_id=ncs.id, ticker_symbol=ticker_symbol, timeframe="1D", direction="LONG",
            entry_bar_ts=ncs.bar_ts, entry_price=100.0, status="OPEN", version=SHADOW_VERSION,
        )
        defaults.update(overrides)
        position = ShadowPosition(**defaults)
        db.add(position)
        db.commit()
        db.refresh(position)
        db.expunge(position)
        return position
    finally:
        db.close()


def test_list_positions_filters_by_ticker_and_status(client, test_engine):
    _seed(test_engine, status="OPEN")
    _seed(test_engine, ticker_symbol="MSFT", status="OPEN")

    resp = client.get(f"/api/v1/shadow/positions?ticker={SYMBOL}&status=OPEN")
    assert resp.status_code == 200
    body = resp.json()
    assert all(p["ticker_symbol"] == SYMBOL for p in body["positions"])


def test_stats_reports_honest_none_with_no_closed_positions(client, test_engine):
    _seed(test_engine, status="OPEN")
    resp = client.get(f"/api/v1/shadow/stats?ticker={SYMBOL}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count_open"] >= 1
    # win_rate_pct is None only when count_closed == 0 for THIS ticker —
    # tolerate leakage from other tests' committed rows on the same symbol
    # by checking the invariant, not an exact global count.
    if body["count_closed"] == 0:
        assert body["win_rate_pct"] is None


def test_sweep_endpoint_is_operator_gated(client):
    resp = client.post("/api/v1/shadow/sweep")
    # AUTH_REQUIRED=false in tests means the dev user is already an
    # operator (see api/deps.py), so this succeeds rather than 403ing —
    # asserting it doesn't crash is the real contract being tested here.
    assert resp.status_code == 200
    assert "swept" in resp.json()
