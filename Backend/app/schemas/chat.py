from datetime import datetime

from pydantic import BaseModel


class CreateChatRequest(BaseModel):
    title: str = "New Chat"


class CreateChatResponse(BaseModel):
    id: int
    title: str


class SendMessageRequest(BaseModel):
    chat_id: int
    message: str
    model: str | None = None
    web_search_enabled: bool = True
    attached_file_ids: list[int] = []


class ResumeMessageRequest(BaseModel):
    chat_id: int
    model: str | None = None
    web_search_enabled: bool = True


class RenameChatRequest(BaseModel):
    title: str


class SendMessageResponse(BaseModel):
    answer: str
    title: str | None = None


class AttachedFileItem(BaseModel):
    id: int
    filename: str
    original_filename: str | None = None
    extension: str | None = None
    mime_type: str | None = None
    content_type: str | None = None
    size: int | None = None
    byte_size: int
    sha256_hash: str | None = None
    sha256: str
    storage_path: str | None = None
    category: str | None = None
    chunk_count: int
    created_at: datetime
    attached_at: datetime | None = None
    updated_at: datetime | None = None
    created: bool = False


class RenameFileRequest(BaseModel):
    filename: str


class AttachedFileListResponse(BaseModel):
    files: list[AttachedFileItem]


class MessageItem(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


class ChatItem(BaseModel):
    id: int
    title: str


class ChatListResponse(BaseModel):
    chats: list[ChatItem]


class ChatDetailResponse(BaseModel):
    id: int
    title: str
    messages: list[MessageItem]
