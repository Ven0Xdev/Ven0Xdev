"""Session memory for the chat assistant, persisted via SQLAlchemy so
conversations survive process restarts and are auditable. A given session
"remembers" prior turns and which ticker it's currently grounded on.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models.chat import ChatMessage, ChatSession


@dataclass
class ChatTurn:
    role: str
    content: str


def get_or_create_session(db: Session, session_key: str) -> ChatSession:
    session = db.query(ChatSession).filter_by(session_key=session_key).one_or_none()
    if session is None:
        session = ChatSession(session_key=session_key)
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def append_message(db: Session, session: ChatSession, role: str, content: str) -> ChatMessage:
    message = ChatMessage(session_id=session.id, role=role, content=content)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def get_history(db: Session, session: ChatSession, limit: int = 20) -> list[ChatTurn]:
    messages = (
        db.query(ChatMessage)
        .filter_by(session_id=session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return [ChatTurn(role=m.role, content=m.content) for m in reversed(messages)]


def set_session_ticker(db: Session, session: ChatSession, ticker: str) -> None:
    session.ticker_symbol = ticker
    db.add(session)
    db.commit()
