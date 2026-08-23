from datetime import datetime

from pydantic import BaseModel


class ChatRequest(BaseModel):
    session_key: str
    message: str
    ticker: str | None = None


class ChatMetadata(BaseModel):
    """Provenance for one assistant answer — never invented, always built
    from what actually produced the reply (see
    services/chat/assistant.py's _build_metadata)."""

    backend: str  # "template" | "llm" — never let template mode read as an LLM.
    model: str | None = None  # set only when backend == "llm".
    data_source: str | None = None
    data_mode: str | None = None
    engine_mode: str | None = None  # "HEURISTIC" | "TRAINED_ML"
    as_of: datetime | None = None
    safe_mode_active: bool
    drift_status: str  # "insufficient_history" | "stable" | "moderate" | "significant"
    confidence_score: float | None = None
    confidence_note: str


class ChatResponse(BaseModel):
    reply: str
    ticker: str | None = None
    session_key: str
    metadata: ChatMetadata


class ChatHistoryTurn(BaseModel):
    role: str
    content: str
    metadata: ChatMetadata | None = None


class ChatHistoryResponse(BaseModel):
    session_key: str
    ticker: str | None
    messages: list[ChatHistoryTurn]
