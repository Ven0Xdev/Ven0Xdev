from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.chat import ChatHistoryResponse, ChatHistoryTurn, ChatRequest, ChatResponse
from app.services.chat import memory
from app.services.chat.assistant import generate_reply

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatResponse)
def send_message(request: ChatRequest, db: Session = Depends(db_session)):
    session = memory.get_or_create_session(db, request.session_key)
    history = memory.get_history(db, session)

    memory.append_message(db, session, "user", request.message)

    reply, resolved_ticker = generate_reply(request.message, request.ticker or session.ticker_symbol, history)

    if resolved_ticker and resolved_ticker != session.ticker_symbol:
        memory.set_session_ticker(db, session, resolved_ticker)

    memory.append_message(db, session, "assistant", reply)

    return ChatResponse(reply=reply, ticker=resolved_ticker, session_key=request.session_key)


@router.get("/history/{session_key}", response_model=ChatHistoryResponse)
def get_history(session_key: str, db: Session = Depends(db_session)):
    session = memory.get_or_create_session(db, session_key)
    history = memory.get_history(db, session, limit=100)
    return ChatHistoryResponse(
        session_key=session_key,
        ticker=session.ticker_symbol,
        messages=[ChatHistoryTurn(role=t.role, content=t.content) for t in history],
    )
