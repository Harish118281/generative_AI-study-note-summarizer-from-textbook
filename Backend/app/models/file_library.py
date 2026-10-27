from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FileLibrary(Base):
    __tablename__ = "file_library"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    extension: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    mime_type: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    size: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    sha256_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )

    storage_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    category: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
        index=True,
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    content_type: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    byte_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    file_data: Mapped[bytes | None] = mapped_column(
        LargeBinary,
        nullable=True,
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

    chunks = relationship(
        "FileChunk",
        back_populates="file",
        cascade="all, delete-orphan",
    )

    chat_links = relationship(
        "ChatFile",
        back_populates="file",
        cascade="all, delete-orphan",
    )

    user = relationship("User", back_populates="files")


class FileChunk(Base):
    __tablename__ = "file_chunks"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    file_id: Mapped[int] = mapped_column(
        ForeignKey("file_library.id"),
        nullable=False,
        index=True,
    )

    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    file = relationship(
        "FileLibrary",
        back_populates="chunks",
    )

    __table_args__ = (
        UniqueConstraint(
            "file_id",
            "chunk_index",
            name="uq_file_chunk_index",
        ),
    )


class ChatFile(Base):
    __tablename__ = "chat_files"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    chat_id: Mapped[int] = mapped_column(
        ForeignKey("chats.id"),
        nullable=False,
        index=True,
    )

    file_id: Mapped[int] = mapped_column(
        ForeignKey("file_library.id"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    file = relationship(
        "FileLibrary",
        back_populates="chat_links",
    )

    chat = relationship(
        "Chat",
        back_populates="chat_files",
    )

    __table_args__ = (
        UniqueConstraint(
            "chat_id",
            "file_id",
            name="uq_chat_file",
        ),
    )
