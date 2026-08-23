"""Session memory for the chat assistant, persisted via SQLAlchemy so
conversations survive process restarts and are auditable. A given session
"remembers" prior turns and which ticker it's currently grounded on.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.chat import ChatMessage, ChatSession

logger = logging.getLogger(__name__)


@dataclass
class ChatTurn:
    role: str
    content: str
    meta: dict | None = None


def get_or_create_session(db: Session, session_key: str) -> ChatSession:
    """Never 500s on a missing session — creates it. `session_key` is
    unique+indexed, so two concurrent first-requests for the same brand-new
    key (e.g. a frontend double-effect firing twice) can both pass the
    SELECT and race on INSERT; the loser's commit raises IntegrityError,
    which is caught here, rolled back, and resolved by re-reading the
    winner's row rather than propagating as an unhandled 500.
    """
    session = db.query(ChatSession).filter_by(session_key=session_key).one_or_none()
    if session is not None:
        return session

    session = ChatSession(session_key=session_key)
    db.add(session)
    try:
        db.commit()
    except IntegrityError as exc:
        logger.info("chat session %r was created concurrently — reusing the existing row", session_key)
        db.rollback()
        session = db.query(ChatSession).filter_by(session_key=session_key).one_or_none()
        if session is None:
            # Extremely unlikely (the row that caused the conflict should
            # exist), but never fabricate a session — surface it clearly.
            raise RuntimeError(
                f"Could not create or find chat session {session_key!r} after a commit conflict."
            ) from exc
        return session
    db.refresh(session)
    return session


def append_message(db: Session, session: ChatSession, role: str, content: str, meta: dict | None = None) -> ChatMessage:
    message = ChatMessage(session_id=session.id, role=role, content=content, meta=meta)
    db.add(message)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
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
    return [ChatTurn(role=m.role, content=m.content, meta=m.meta) for m in reversed(messages)]


def set_session_ticker(db: Session, session: ChatSession, ticker: str | None) -> None:
    session.ticker_symbol = ticker
    db.add(session)
    db.commit()
