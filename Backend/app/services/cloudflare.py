import json
from collections.abc import Iterator
from datetime import datetime

from openai import APIStatusError, OpenAI

from app.core.config import settings
from app.services.model_limits import CLOUDFLARE_QWEN_MODEL_NAME
from app.services.tavily_web_search import search_web
from app.services.web_search_policy import is_social_message, latest_user_message


WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search for current or explicitly requested information. Set include_images=true "
            "when real-world photos would significantly help explain the topic, such as "
            "showing concrete examples. Do not request images for greetings, abstract ideas, "
            "or when visuals add little value."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "include_images": {
                    "type": "boolean",
                    "description": "Whether helpful real-world images should be included.",
                },
            },
            "required": ["query"],
        },
    },
}


class CloudflareApiError(RuntimeError):
    pass


def generate_cloudflare_chat_response(
    conversation: list[dict],
    web_search_enabled: bool = True,
) -> str:
    client = _client()
    messages = _to_openai_messages(conversation)
    if web_search_enabled and not is_social_message(latest_user_message(conversation)):
        decision = _create_completion(
            client,
            model=CLOUDFLARE_QWEN_MODEL_NAME,
            messages=_with_search_instruction(messages),
            temperature=0.2,
            max_tokens=8192,
            tools=[WEB_SEARCH_TOOL],
            tool_choice="auto",
        )
        assistant_message = decision.choices[0].message
        calls = getattr(assistant_message, "tool_calls", None) or []
        search_call = next(
            (call for call in calls if call.function.name == "web_search"),
            None,
        )
        if search_call:
            try:
                query = json.loads(search_call.function.arguments).get("query", "")
            except (json.JSONDecodeError, AttributeError):
                query = ""
            if query.strip():
                try:
                    include_images = bool(json.loads(search_call.function.arguments).get("include_images"))
                except (json.JSONDecodeError, AttributeError):
                    include_images = False
                results = search_web(query, include_images=include_images) or "No web results were available."
                messages = _with_search_instruction(messages)
                messages.extend([
                    {
                        "role": "assistant",
                        "content": assistant_message.content,
                        "tool_calls": [
                            {
                                "id": search_call.id,
                                "type": "function",
                                "function": {
                                    "name": "web_search",
                                    "arguments": search_call.function.arguments,
                                },
                            }
                        ],
                    },
                    {"role": "tool", "tool_call_id": search_call.id, "content": results},
                ])
                response = _create_completion(
                    client,
                    model=CLOUDFLARE_QWEN_MODEL_NAME,
                    messages=messages,
                    temperature=0.6,
                    max_tokens=8192,
                )
                return _response_text(response.choices[0].message.content)
        if assistant_message.content:
            return _response_text(assistant_message.content)

    response = _create_completion(
        client,
        model=CLOUDFLARE_QWEN_MODEL_NAME,
        messages=messages,
        temperature=0.6,
        max_tokens=8192,
    )
    return _response_text(response.choices[0].message.content)


def generate_cloudflare_chat_response_stream(
    conversation: list[dict],
) -> Iterator[str]:
    response = _create_completion(
        _client(),
        model=CLOUDFLARE_QWEN_MODEL_NAME,
        messages=_to_openai_messages(conversation),
        temperature=0.6,
        max_tokens=8192,
        stream=True,
    )
    for chunk in response:
        if not chunk.choices:
            continue
        text = chunk.choices[0].delta.content
        if text:
            yield text


def generate_cloudflare_chat_events_stream(
    conversation: list[dict],
    web_search_enabled: bool = True,
) -> Iterator[dict]:
    if not web_search_enabled or is_social_message(latest_user_message(conversation)):
        for text in generate_cloudflare_chat_response_stream(conversation):
            yield {"event": "chunk", "data": {"text": text}}
        return

    client = _client()
    messages = _with_search_instruction(_to_openai_messages(conversation))
    decision = _create_completion(
        client,
        model=CLOUDFLARE_QWEN_MODEL_NAME,
        messages=messages,
        temperature=0.2,
        max_tokens=8192,
        tools=[WEB_SEARCH_TOOL],
        tool_choice="auto",
    )
    assistant_message = decision.choices[0].message
    call = next(
        (item for item in (getattr(assistant_message, "tool_calls", None) or [])
         if item.function.name == "web_search"),
        None,
    )
    if call is None:
        yield {"event": "chunk", "data": {"text": _response_text(assistant_message.content)}}
        return

    try:
        query = json.loads(call.function.arguments).get("query", "").strip()
    except (json.JSONDecodeError, AttributeError):
        query = ""
    if not query:
        yield {"event": "chunk", "data": {"text": _response_text(assistant_message.content)}}
        return

    try:
        include_images = bool(json.loads(call.function.arguments).get("include_images"))
    except (json.JSONDecodeError, AttributeError):
        include_images = False
    yield {"event": "web_search", "data": {"status": "started", "message": "Searching images..." if include_images else "Web searching..."}}
    results = search_web(query, include_images=include_images)
    finished_message = "Images found" if include_images and results else "Web search complete" if results else "Web search unavailable"
    yield {"event": "web_search", "data": {"status": "finished", "message": finished_message}}
    messages.extend([
        {
            "role": "assistant",
            "content": assistant_message.content,
            "tool_calls": [{
                "id": call.id,
                "type": "function",
                "function": {"name": "web_search", "arguments": call.function.arguments},
            }],
        },
        {"role": "tool", "tool_call_id": call.id, "content": results or "No web results were available."},
    ])
    response = _create_completion(
        client,
        model=CLOUDFLARE_QWEN_MODEL_NAME,
        messages=messages,
        temperature=0.6,
        max_tokens=8192,
        stream=True,
    )
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield {"event": "chunk", "data": {"text": chunk.choices[0].delta.content}}


def _with_search_instruction(messages: list[dict]) -> list[dict]:
    today = datetime.now().strftime("%B %d, %Y")
    instruction = (
        "You are an assistant with a web_search tool. Use it for current, latest, "
        "recent, time-sensitive, this-year, or explicitly web-search requests. "
        "Also use it with include_images=true when real-world example photos would "
        "materially improve an explanation. This visual-only search is allowed "
        "for stable facts. Do not request images for greetings, purely abstract "
        "topics, or when visuals add little value. For image results, "
        "include up to three relevant Markdown images in a compact row, each linked "
        "to its source page. Do not invent image URLs. Do not search for stable "
        "general knowledge unless images would help. When searching, base the answer "
        "on results and cite source URLs as Markdown links. "
        f"Current date: {today}."
    )
    return [{"role": "system", "content": instruction}, *messages]


def _client() -> OpenAI:
    missing = [
        name
        for name, value in (
            ("CLOUDFLARE_API_KEY", settings.CLOUDFLARE_API_KEY),
            ("CLOUDFLARE_ACCOUNT_ID", settings.CLOUDFLARE_ACCOUNT_ID),
        )
        if not value
    ]
    if missing:
        raise CloudflareApiError(
            f"Missing {' and '.join(missing)} in Backend/.env."
        )
    return OpenAI(
        base_url=(
            "https://api.cloudflare.com/client/v4/accounts/"
            f"{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1"
        ),
        api_key=settings.CLOUDFLARE_API_KEY,
    )


def _create_completion(client: OpenAI, **kwargs):
    try:
        return client.chat.completions.create(**kwargs)
    except APIStatusError as error:
        if error.status_code == 401:
            raise CloudflareApiError(
                "Cloudflare authentication failed (401). Check that "
                "CLOUDFLARE_API_KEY is a valid API token with Workers AI access "
                "for the configured account."
            ) from error
        if error.status_code == 403:
            raise CloudflareApiError(
                "Cloudflare denied access (403). Check the token's Workers AI "
                "permissions and account scope."
            ) from error
        raise CloudflareApiError(
            f"Cloudflare Qwen request failed ({error.status_code}): {error.message}"
        ) from error


def _to_openai_messages(conversation: list[dict]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in conversation:
        text = "\n".join(
            part["text"].strip()
            for part in item.get("parts", [])
            if isinstance(part, dict)
            and isinstance(part.get("text"), str)
            and part["text"].strip()
        )
        if not text:
            continue
        role = "assistant" if item.get("role") == "model" else "user"
        if text.startswith("Assistant Instructions"):
            role = "system"
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n\n{text}"
        else:
            messages.append({"role": role, "content": text})
    if not messages:
        raise CloudflareApiError("The Qwen request has no text content.")
    return messages


def _response_text(content: str | None) -> str:
    if not content or not content.strip():
        raise CloudflareApiError("Cloudflare Qwen returned an empty response.")
    return content.strip()
