from typing import List

from google import genai
from google.genai import errors

from app.core.config import settings
from app.models.message import Message
from app.services.conversation_service import build_conversation
from app.services.model_limits import (
    CHAT_OUTPUT_TOKEN_LIMIT,
    ESTIMATED_CHARS_PER_TOKEN,
    LOCAL_TOKEN_ESTIMATE_SAFE_RATIO,
    MODEL_NAME,
    RECENT_MESSAGE_LIMIT,
    SMALL_CHAT_MESSAGE_LIMIT,
    TOTAL_CONTEXT_LIMIT,
    is_gemini_model,
)
from app.services.gemini_usage_logger import log_gemini_call


client = genai.Client(
    api_key=settings.GEMINI_API_KEY,
)

# Reserve space for Gemini's answer.
RESERVED_OUTPUT_TOKENS = CHAT_OUTPUT_TOKEN_LIMIT

# Keep at least these many recent messages.
MIN_RECENT_MESSAGES = RECENT_MESSAGE_LIMIT


def count_tokens(
    prompt: List[dict],
    model: str = MODEL_NAME,
) -> int:

    try:
        log_gemini_call("count_tokens", model)
        response = client.models.count_tokens(
            model=model,
            contents=prompt,
        )
    except errors.APIError as error:
        if error.code == 429:
            raise RuntimeError(
                "Gemini quota limit reached while checking token size. "
                "Please retry later."
            ) from error

        raise

    return response.total_tokens


def _iter_prompt_text(prompt: List[dict]):
    for item in prompt:
        parts = item.get("parts", [])

        for part in parts:
            text = part.get("text")

            if isinstance(text, str):
                yield text


def estimate_prompt_tokens(prompt: List[dict]) -> int:
    """
    Fast local estimate so normal chat messages do not need a Gemini
    count_tokens API call.
    """

    character_count = sum(
        len(text)
        for text in _iter_prompt_text(prompt)
    )

    return max(
        1,
        (
            character_count + ESTIMATED_CHARS_PER_TOKEN - 1
        ) // ESTIMATED_CHARS_PER_TOKEN,
    )


def input_token_budget(
    context_window: int = TOTAL_CONTEXT_LIMIT,
    reserved_output_tokens: int = RESERVED_OUTPUT_TOKENS,
) -> int:
    return context_window - reserved_output_tokens


def fits_token_budget(
    prompt: List[dict],
    context_window: int = TOTAL_CONTEXT_LIMIT,
    reserved_output_tokens: int = RESERVED_OUTPUT_TOKENS,
    message_count: int | None = None,
    model: str = MODEL_NAME,
) -> bool:

    budget = input_token_budget(
        context_window=context_window,
        reserved_output_tokens=reserved_output_tokens,
    )
    estimated_tokens = estimate_prompt_tokens(prompt)

    if message_count is not None and message_count <= SMALL_CHAT_MESSAGE_LIMIT:
        return estimated_tokens <= budget

    if estimated_tokens <= budget * LOCAL_TOKEN_ESTIMATE_SAFE_RATIO:
        return True

    if not is_gemini_model(model):
        return estimated_tokens <= budget

    try:
        return count_tokens(prompt, model) <= budget
    except RuntimeError as error:
        if "Gemini quota limit reached" not in str(error):
            raise

        return estimated_tokens <= budget


def remaining_tokens(
    prompt: List[dict],
    context_window: int = TOTAL_CONTEXT_LIMIT,
    reserved_output_tokens: int = RESERVED_OUTPUT_TOKENS,
    model: str = MODEL_NAME,
) -> int:

    return (
        context_window
        - reserved_output_tokens
        - count_tokens(prompt, model)
    )


def select_recent_messages(
    messages: list[Message],
    summary: str | None,
    context_window: int = TOTAL_CONTEXT_LIMIT,
    model: str = MODEL_NAME,
) -> list[Message]:
    """
    Select as many recent messages as possible while respecting the token budget.
    """

    if not messages:
        return []

    selected = messages[-MIN_RECENT_MESSAGES:]
    remaining = messages[:-MIN_RECENT_MESSAGES]

    for message in reversed(remaining):
        candidate = [message] + selected
        prompt = []

        if summary:
            prompt.append(
                {
                    "role": "user",
                    "parts": [
                        {
                            "text":
                            "Conversation Summary\n\n"
                            f"{summary}"
                        }
                    ],
                }
            )

        prompt.extend(
            build_conversation(candidate)
        )

        if fits_token_budget(
            prompt=prompt,
            context_window=context_window,
            model=model,
        ):
            selected = candidate
        else:
            break

    return selected


def should_update_summary(
    unsummarized_messages: list[Message],
    threshold: int = 20,
) -> bool:
    """
    Decide whether the summary should be updated.
    """

    return len(unsummarized_messages) > threshold
