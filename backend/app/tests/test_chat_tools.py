"""Assistant tool registry + epistemic labeling."""
from app.services.chat.assistant import generate_reply
from app.services.chat.tools import TOOLS, anthropic_tool_schemas, execute_tool
from app.services.data_providers.mock_provider import MockOTCProvider


def _provider():
    return MockOTCProvider()


def test_every_tool_has_schema_and_executor():
    for tool in TOOLS:
        assert tool["name"] and tool["description"]
        assert tool["input_schema"]["type"] == "object"
        assert callable(tool["executor"])
    schemas = anthropic_tool_schemas()
    assert all(set(s) == {"name", "description", "input_schema"} for s in schemas)


def test_get_stock_analysis_tool_returns_live_contract():
    provider = _provider()
    symbol = provider.get_universe(limit=1)[0].symbol
    result = execute_tool("get_stock_analysis", {"symbol": symbol}, None, provider)
    assert result["ticker"] == symbol
    assert 0 <= result["overall_ai_score"] <= 100
    assert "feature_vector" not in result  # internals stay internal


def test_deliberation_tool_returns_staged_trace():
    provider = _provider()
    symbol = provider.get_universe(limit=1)[0].symbol
    result = execute_tool("get_deliberation", {"symbol": symbol}, None, provider)
    assert [s["stage"] for s in result["stages"]][0] == "evidence"
    assert result["verdict"]["conviction"] <= 0.97


def test_unknown_tool_returns_explicit_error():
    result = execute_tool("nonexistent", {}, None, _provider())
    assert "unknown tool" in result["error"]


def test_tool_failure_is_reported_not_raised():
    result = execute_tool("get_prediction_history", {"symbol": "X"}, None, _provider())
    assert "error" in result  # db unavailable -> explicit, not exception


def test_template_reply_carries_epistemic_labels():
    provider = _provider()
    symbol = provider.get_universe(limit=1)[0].symbol
    reply, resolved, metadata = generate_reply(f"Should I buy {symbol}?", None, [])
    assert resolved == symbol
    for label in ("Facts:", "Predictions:", "Assumptions:", "Missing:"):
        assert label in reply, f"missing epistemic label {label}"
    assert metadata["backend"] == "template"
    assert metadata["model"] is None
