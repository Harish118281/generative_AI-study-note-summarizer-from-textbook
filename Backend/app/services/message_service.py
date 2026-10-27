from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.models.message import Message


# ---------------------------------------
# Save Message
# ---------------------------------------
def save_message(
    db: Session,
    chat_id: int,
    role: str,
    content: str,
) -> Message:

    message = Message(
        chat_id=chat_id,
        role=role,
        content=content,
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return message


# ---------------------------------------
# Get All Messages
# ---------------------------------------
def get_messages(
    db: Session,
    chat_id: int,
) -> list[Message]:

    return (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.id.asc())
        .all()
    )


# ---------------------------------------
# Get Recent Messages
# ---------------------------------------
def get_recent_messages(
    db: Session,
    chat_id: int,
    limit: int,
) -> list[Message]:

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
        .limit(limit)
        .all()
    )

    return list(reversed(messages))


# ---------------------------------------
# Get Unsummarized Messages
# ---------------------------------------
def get_unsummarized_messages(
    db: Session,
    chat: Chat,
) -> list[Message]:

    query = (
        db.query(Message)
        .filter(Message.chat_id == chat.id)
    )

    if chat.summarized_until_message_id is not None:
        query = query.filter(
            Message.id > chat.summarized_until_message_id
        )

    return (
        query
        .order_by(Message.id.asc())
        .all()
    )


# ---------------------------------------
# Get Messages After Message ID
# ---------------------------------------
def get_messages_after(
    db: Session,
    chat_id: int,
    message_id: int,
) -> list[Message]:

    return (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.id > message_id,
        )
        .order_by(Message.id.asc())
        .all()
    )


# ---------------------------------------
# Get Message By ID
# ---------------------------------------
def get_message(
    db: Session,
    message_id: int,
) -> Message | None:

    return (
        db.query(Message)
        .filter(Message.id == message_id)
        .first()
    )
