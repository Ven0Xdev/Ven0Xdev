from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ticker_symbol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        # Hot path: session history, chronological.
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String(16))  # user, assistant
    content: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
