"""GET /chat/ai-status: the structured "is the LLM path usable" contract —
never a crash, never claims availability it doesn't have."""


def test_ai_status_reports_unavailable_without_a_key(client):
    res = client.get("/api/v1/chat/ai-status")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False
    assert body["message"] == "AI provider is not configured"


def test_chat_message_still_works_with_no_ai_key(client):
    # The template backend must keep answering even with no LLM configured.
    res = client.post("/api/v1/chat/message", json={"session_key": "test-session-1", "message": "hello"})
    assert res.status_code == 200
    assert res.json()["reply"]


def test_chat_history_returns_200_for_unknown_session(client):
    res = client.get("/api/v1/chat/history/brand-new-session-key")
    assert res.status_code == 200
    body = res.json()
    assert body["session_key"] == "brand-new-session-key"
    assert body["messages"] == []
