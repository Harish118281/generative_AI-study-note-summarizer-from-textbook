from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="New Chat",
    )

    # -----------------------------
    # Conversation Summary
    # -----------------------------
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )

    # Last message already included in the summary
    summarized_until_message_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=None,
    )

    # Last time the summary was updated
    summary_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        default=None,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    messages = relationship(
        "Message",
        back_populates="chat",
        cascade="all, delete-orphan",
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    chat_files = relationship(
        "ChatFile",
        back_populates="chat",
        cascade="all, delete-orphan",
    )

    user = relationship("User", back_populates="chats")
