from pydantic import BaseModel


class ChatRequest(BaseModel):
    session_key: str
    message: str
    ticker: str | None = None


class ChatResponse(BaseModel):
    reply: str
    ticker: str | None = None
    session_key: str


class ChatHistoryTurn(BaseModel):
    role: str
    content: str


class ChatHistoryResponse(BaseModel):
    session_key: str
    ticker: str | None
    messages: list[ChatHistoryTurn]
