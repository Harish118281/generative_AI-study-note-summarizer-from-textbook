from collections.abc import Iterator

from app.services.gemini import (
    generate_chat_response as generate_gemini_chat_response,
    generate_chat_response_stream as generate_gemini_chat_response_stream,
    generate_summary_response as generate_gemini_summary_response,
)
from app.services.cloudflare import (
    generate_cloudflare_chat_response,
    generate_cloudflare_chat_response_stream,
    generate_cloudflare_chat_events_stream,
)
from app.services.model_limits import is_cloudflare_model, is_nvidia_model
from app.services.nvidia import (
    generate_nvidia_chat_response,
    generate_nvidia_chat_response_stream,
    generate_nvidia_summary_response,
)


def generate_chat_response(
    conversation: list[dict],
    model_name: str,
    web_search_enabled: bool = True,
) -> str:
    if is_nvidia_model(model_name):
        return generate_nvidia_chat_response(
            conversation=conversation,
            model_name=model_name,
        )

    if is_cloudflare_model(model_name):
        return generate_cloudflare_chat_response(
            conversation,
            web_search_enabled=web_search_enabled,
        )

    return generate_gemini_chat_response(
        conversation=conversation,
        model_name=model_name,
        web_search_enabled=web_search_enabled,
    )


def generate_chat_response_stream(
    conversation: list[dict],
    model_name: str,
) -> Iterator[str]:
    if is_nvidia_model(model_name):
        yield from generate_nvidia_chat_response_stream(
            conversation=conversation,
            model_name=model_name,
        )
        return

    if is_cloudflare_model(model_name):
        yield from generate_cloudflare_chat_response_stream(conversation)
        return

    yield from generate_gemini_chat_response_stream(
        conversation=conversation,
        model_name=model_name,
    )


def generate_chat_response_events_stream(
    conversation: list[dict],
    model_name: str,
    web_search_enabled: bool = True,
) -> Iterator[dict]:
    if is_cloudflare_model(model_name):
        yield from generate_cloudflare_chat_events_stream(
            conversation,
            web_search_enabled=web_search_enabled,
        )
        return

    for text in generate_chat_response_stream(conversation, model_name):
        yield {"event": "chunk", "data": {"text": text}}


def generate_summary_response(
    conversation: list[dict],
    model_name: str,
) -> str:
    if is_nvidia_model(model_name):
        return generate_nvidia_summary_response(
            conversation=conversation,
            model_name=model_name,
        )

    if is_cloudflare_model(model_name):
        return generate_cloudflare_chat_response(conversation)

    return generate_gemini_summary_response(
        conversation=conversation,
        model_name=model_name,
    )
