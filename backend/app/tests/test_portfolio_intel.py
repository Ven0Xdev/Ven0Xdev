"""Portfolio Intelligence: health, concentration, sizing, and the dossier."""
from app.db.models.portfolio import PortfolioPosition
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.portfolio_intel.engine import (
    MAX_SINGLE_POSITION_PCT,
    assess_portfolio,
)
from app.services.portfolio_intel.recommendation import build_recommendation_dossier

DOSSIER_SECTIONS = [
    "why_buy", "why_not_buy", "biggest_risks", "confidence_calculation",
    "manipulation_risk", "liquidity_analysis", "historical_similarities",
    "missing_information", "invalidation_conditions",
]


def _open(db, symbol, quantity, price):
    db.add(PortfolioPosition(ticker_symbol=symbol, quantity=quantity, avg_entry_price=price))
    db.commit()


def test_empty_portfolio_is_a_valid_report(db_session):
    health = assess_portfolio(db_session, MockOTCProvider())
    assert health.position_count == 0
    assert health.total_market_value == 0
    assert health.health_grade in "ABCD"


def test_weights_sum_and_hhi(db_session):
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=4)]
    for s in symbols:
        _open(db_session, s, 100, 1.0)
    health = assess_portfolio(db_session, provider)
    priced = [a for a in health.assessments if a.weight_pct is not None]
    assert abs(sum(a.weight_pct for a in priced) - 100) < 0.01
    assert 0 < health.herfindahl_index <= 1


def test_excessive_concentration_alert(db_session):
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=2)]
    # First position dwarfs the second -> single-position breach.
    quotes = {s: provider.get_quote(s).last for s in symbols}
    _open(db_session, symbols[0], 100_000 / quotes[symbols[0]], quotes[symbols[0]])
    _open(db_session, symbols[1], 1_000 / quotes[symbols[1]], quotes[symbols[1]])

    health = assess_portfolio(db_session, provider)
    assert health.largest_position_pct > MAX_SINGLE_POSITION_PCT
    codes = {a["code"] for a in health.alerts}
    assert "excessive_single_position" in codes


def test_sizing_verdicts_cite_numbers(db_session):
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    _open(db_session, symbol, 1000, provider.get_quote(symbol).last)
    health = assess_portfolio(db_session, provider)
    a = health.assessments[0]
    assert a.sizing_verdict in ("trim", "hold", "room_to_add")
    assert "%" in a.sizing_reason  # reasons always cite the numbers


def test_single_position_book_is_downgraded(db_session):
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    _open(db_session, symbol, 1000, 1.0)
    health = assess_portfolio(db_session, provider)
    # 100% in one name: concentrated by definition.
    assert health.herfindahl_index > 0.9
    assert health.health_grade in ("C", "D")


def test_dossier_answers_all_nine_sections(db_session):
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    dossier = build_recommendation_dossier(symbol, provider, db=db_session)
    for section in DOSSIER_SECTIONS:
        assert section in dossier, f"missing section {section}"
        assert dossier[section], f"section {section} is empty"

    conf = dossier["confidence_calculation"]
    assert conf["conviction"] <= 0.97
    assert set(conf["components"]) == {"evidence_agreement", "model_confidence", "calibration_damping"}
    assert dossier["probabilities"]["up_10_within_horizon"] < 1.0


def test_dossier_missing_information_is_honest(db_session):
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    dossier = build_recommendation_dossier(symbol, provider, db=db_session)
    # Fresh DB -> no graded history; the dossier must say so, not hide it.
    assert any("no graded history" in m.lower() or "graded outcomes" in m.lower()
               for m in dossier["missing_information"])
