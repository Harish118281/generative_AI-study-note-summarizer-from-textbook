import re

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chat import Chat
from app.models.message import Message


MAX_TEMP_TITLE_LENGTH = 44
MAX_FINAL_TITLE_LENGTH = 60
TITLE_SYSTEM_PROMPT = (
    "Create a concise, specific title for this chat based on the user's first "
    "message and the assistant's first response. Give the user's message the "
    "most weight; use the answer only to clarify its topic. For greetings or "
    "messages without a clear topic, make a brief title reflecting that actual "
    "intent without inventing a subject. Return only a title of at most 7 words "
    "and 60 characters. No quotes, punctuation, or explanation."
)


def set_temporary_title_from_user_message(
    db: Session,
    chat_id: int,
    user_message: str,
) -> str | None:
    """
    Keep the first user message as the temporary title until the title model
    creates the final title from the first user message and assistant response.
    """

    chat = _get_chat(db, chat_id)

    if chat is None:
        return None

    if _count_messages(db, chat_id, "user") != 1:
        return None

    temporary_title = clean_temporary_title(user_message)

    if not temporary_title:
        return chat.title

    chat.title = temporary_title
    db.commit()
    db.refresh(chat)

    print(
        f"[Title] chat {chat_id} temporary: {chat.title}",
        flush=True,
    )

    return chat.title


def update_title_from_first_assistant_response(
    db: Session,
    chat_id: int,
    assistant_response: str,
) -> str | None:
    """
    Generate the final title only once: after the first assistant response.
    The title model receives both the first user message and assistant response.
    """

    chat = _get_chat(db, chat_id)

    if chat is None:
        return None

    first_user_message = _get_first_message(
        db=db,
        chat_id=chat_id,
        role="user",
    )
    first_assistant_message = _get_first_message(
        db=db,
        chat_id=chat_id,
        role="assistant",
    )

    if first_user_message is None or first_assistant_message is None:
        return None

    temporary_title = clean_temporary_title(first_user_message.content)

    if chat.title not in {"New Chat", temporary_title}:
        return None

    conversation = build_title_conversation(
        user_message=first_user_message.content,
        assistant_response=first_assistant_message.content,
    )
    generated_title = generate_chat_title_from_response(conversation)

    if not generated_title:
        print(
            f"[Title] chat {chat_id}: keeping temporary title",
            flush=True,
        )
        return None

    chat.title = generated_title
    db.commit()
    db.refresh(chat)

    print(
        f"[Title] chat {chat_id} final: {chat.title}",
        flush=True,
    )

    return chat.title


def generate_chat_title_from_response(
    conversation: str,
) -> str | None:
    if not conversation.strip():
        return None

    if not settings.CLOUDFLARE_API_KEY or not settings.CLOUDFLARE_ACCOUNT_ID:
        print(
            "[Title] Cloudflare credentials are not configured; keeping temporary title",
            flush=True,
        )
        return None

    try:
        client = OpenAI(
            base_url=(
                "https://api.cloudflare.com/client/v4/accounts/"
                f"{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1"
            ),
            api_key=settings.CLOUDFLARE_API_KEY,
            timeout=20.0,
            max_retries=0,
        )
        response = client.chat.completions.create(
            model=settings.CLOUDFLARE_TITLE_MODEL,
            messages=[
                {"role": "system", "content": TITLE_SYSTEM_PROMPT},
                {"role": "user", "content": conversation},
            ],
            temperature=0.2,
            max_tokens=32,
        )
        raw_title = response.choices[0].message.content or ""
    except Exception as error:
        print(f"[Title] Cloudflare Workers AI title generation failed: {error}", flush=True)
        return None

    cleaned_title = clean_final_title(raw_title)

    if not cleaned_title:
        print(
            f"[Title] rejected Cloudflare title: {raw_title!r}",
            flush=True,
        )

    return cleaned_title


def build_title_conversation(
    user_message: str,
    assistant_response: str,
) -> str:
    return (
        "First user message:\n"
        f"{user_message.strip()}\n\n"
        "First assistant response:\n"
        f"{assistant_response.strip()}"
    )


def clean_temporary_title(
    user_message: str,
) -> str | None:
    title = _clean_title_text(user_message)

    if not title:
        return None

    if len(title) > MAX_TEMP_TITLE_LENGTH:
        title = title[:MAX_TEMP_TITLE_LENGTH].rsplit(" ", 1)[0].strip()

    return title or None


def clean_final_title(
    title: str,
) -> str | None:
    cleaned = _clean_title_text(title)

    if not cleaned:
        return None

    lowered = cleaned.lower()

    if lowered in {"new chat", "chat", "conversation", "discussion"}:
        return None

    banned_words = {"conversation", "chat", "discussion"}
    words = re.findall(r"[A-Za-z0-9]+", cleaned)

    filtered_words = [
        word
        for word in words
        if word.lower() not in banned_words
    ]

    if not filtered_words:
        return None

    filtered_words = filtered_words[:7]

    cleaned = " ".join(filtered_words)

    if len(cleaned) > MAX_FINAL_TITLE_LENGTH:
        cleaned = cleaned[:MAX_FINAL_TITLE_LENGTH].rsplit(" ", 1)[0].strip()

    return cleaned or None


def _clean_title_text(
    title: str,
) -> str:
    cleaned = title.strip()
    cleaned = cleaned.splitlines()[0].strip()
    cleaned = re.sub(r"^(title|chat title)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[\"'`*_#\-\s]+|[\"'`*_#\-\s]+$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.rstrip(".:;,- ")
    cleaned = re.sub(r"^[\"'`*_#\-\s]+|[\"'`*_#\-\s]+$", "", cleaned)

    return cleaned


def _get_chat(
    db: Session,
    chat_id: int,
) -> Chat | None:
    return (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )


def _count_messages(
    db: Session,
    chat_id: int,
    role: str,
) -> int:
    return (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.role == role,
        )
        .count()
    )


def _get_first_message(
    db: Session,
    chat_id: int,
    role: str,
) -> Message | None:
    return (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.role == role,
        )
        .order_by(Message.id.asc())
        .first()
    )
