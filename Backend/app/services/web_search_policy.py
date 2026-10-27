import re
from datetime import datetime


_CONTEXT_PREFIXES = (
    "system runtime information",
    "assistant instructions",
    "user memory",
    "conversation summary",
    "relevant attached file context",
)

_SOCIAL_MESSAGES = {
    "hi",
    "hello",
    "hey",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
    "how are you",
    "thanks",
    "thank you",
    "ok",
    "okay",
}


def latest_user_message(conversation: list[dict]) -> str:
    for item in reversed(conversation):
        if item.get("role") not in {"user", "human"}:
            continue

        content = item.get("content")
        if isinstance(content, str):
            text = content.strip()
        else:
            text = "\n".join(
                part.get("text", "").strip()
                for part in item.get("parts", [])
                if isinstance(part, dict)
                and isinstance(part.get("text"), str)
            ).strip()

        if not text:
            continue

        if text.lower().startswith(_CONTEXT_PREFIXES):
            continue

        return text

    return ""


def is_social_message(message: str) -> bool:
    normalized = re.sub(r"[^a-z\s]", "", message.lower()).strip()
    return normalized in _SOCIAL_MESSAGES


def normalize_current_year_query(query: str, conversation: list[dict]) -> str:
    message = latest_user_message(conversation)
    if not re.search(
        r"\b(this year|so far this year|year to date|till today|to date)\b",
        message,
        re.IGNORECASE,
    ):
        return query

    current_year = str(datetime.now().year)
    normalized = re.sub(r"\b(?:19|20)\d{2}\b", current_year, query)
    return normalized if current_year in normalized else f"{current_year} {normalized}"
