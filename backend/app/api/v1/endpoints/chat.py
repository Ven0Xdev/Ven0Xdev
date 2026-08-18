from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, get_current_user
from app.core.config import get_settings
from app.db.models.user import User
from app.schemas.chat import ChatHistoryResponse, ChatHistoryTurn, ChatRequest, ChatResponse
from app.services.chat import memory
from app.services.chat.assistant import generate_reply

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/ai-status")
def ai_status():
    """Whether the LLM-enhanced chat backend is actually usable right now.
    Never a crash if the key is missing — /chat/message and /chat/history
    both keep working regardless (they fall back to the deterministic
    "template" assistant, which needs no external key at all); this just
    tells the frontend whether to advertise the LLM-grounded experience.
    """
    settings = get_settings()
    if settings.chat_backend == "llm" and settings.anthropic_api_key:
        return {"available": True, "message": "AI provider configured", "backend": "llm", "model": settings.chat_model}
    return {"available": False, "message": "AI provider is not configured", "backend": "template"}


def _owned_session(db: Session, session_key: str, user: User):
    """Sessions are user-owned. A key belonging to another account is a 403
    (fixes the key-guessing hijack, audit S3); pre-tenancy sessions
    (user_id NULL) are claimed by whoever touches them first — acceptable
    exactly once, at migration time, and recorded here on purpose.
    """
    session = memory.get_or_create_session(db, session_key)
    if session.user_id is None:
        session.user_id = user.id
        db.add(session)
        db.commit()
    elif session.user_id != user.id:
        raise HTTPException(status_code=403, detail="This chat session belongs to another account")
    return session


@router.post("/message", response_model=ChatResponse)
def send_message(
    request: ChatRequest,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    session = _owned_session(db, request.session_key, user)
    history = memory.get_history(db, session)

    memory.append_message(db, session, "user", request.message)

    reply, resolved_ticker, metadata = generate_reply(
        request.message, request.ticker or session.ticker_symbol, history, db=db
    )

    if resolved_ticker and resolved_ticker != session.ticker_symbol:
        memory.set_session_ticker(db, session, resolved_ticker)

    memory.append_message(db, session, "assistant", reply, meta=metadata)

    return ChatResponse(reply=reply, ticker=resolved_ticker, session_key=request.session_key, metadata=metadata)


@router.delete("/sessions/{session_key}/ticker")
def clear_session_ticker(
    session_key: str,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    """Explicitly clears the session's remembered ticker context — the
    backend for the removable context chip. Distinct from just not passing
    `ticker` on the next /chat/message: that falls back to whatever's
    already remembered (session.ticker_symbol), so a chip the user
    dismissed would otherwise keep silently grounding the next answer on
    the old symbol.
    """
    session = _owned_session(db, session_key, user)
    memory.set_session_ticker(db, session, None)
    return {"session_key": session_key, "ticker": None}


@router.get("/history/{session_key}", response_model=ChatHistoryResponse)
def get_history(
    session_key: str,
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    session = _owned_session(db, session_key, user)
    history = memory.get_history(db, session, limit=100)
    return ChatHistoryResponse(
        session_key=session_key,
        ticker=session.ticker_symbol,
        messages=[ChatHistoryTurn(role=t.role, content=t.content, metadata=t.meta) for t in history],
    )
