import html
import json
import re
from datetime import datetime
from collections.abc import Iterator

from openai import APIStatusError, OpenAI

from app.core.config import settings
from app.services.model_limits import NVIDIA_NEMOTRON_MODEL_NAME
from app.services.web_search_policy import (
    is_social_message,
    latest_user_message,
    normalize_current_year_query,
)


NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT = 16_384
NVIDIA_SUMMARY_OUTPUT_TOKEN_LIMIT = 4_096

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for current, latest, recent, live, or time-sensitive "
            "information. Use this for news, prices, weather, sports results, "
            "release dates, laws, product versions, or when the user directly asks "
            "to search the web/internet. Set include_images=true when real-world "
            "photos would materially improve an explanation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The web search query to run.",
                },
                "search_depth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "description": "Use advanced for explicit deep/comprehensive research; otherwise basic.",
                },
                "include_images": {
                    "type": "boolean",
                    "description": "Include relevant images when they substantially help explain the topic.",
                },
            },
            "required": ["query"],
        },
    },
}

WEB_SEARCH_DECISION_PROMPT = """
You have access to a web_search tool.

Use web_search when the user asks for current, latest, recent, live, or
time-sensitive information. This includes questions about this year, today,
new releases, movies, news, prices, sports, weather, laws, product versions,
release dates, current people, or anything that may have changed recently.

Also search when the user requests deep, comprehensive, or source-backed
research. Use advanced depth for these requests and basic depth for ordinary
freshness checks. Do not search stable general knowledge unless useful images
would materially improve a visual explanation. If search is used,
wait for results, ground the answer in them, and cite factual claims with
Markdown links to the provided source URLs. Do not invent sources.

Also use web_search when the user directly asks to search the web, internet,
Google, look up, or find current information.

Use web_search with include_images=true when real-world example photos would
materially improve an explanation, such as showing concrete devices, places,
animals, or processes. This visual-only search is allowed even if facts are
stable. Do not request images for greetings, purely abstract topics, or when
visuals add little value. When image results are provided, include up
to three relevant Markdown images in a compact row, each linked to its source.
Use only the supplied image URLs.

Do not answer current/latest questions from memory.
If web_search is needed, call the tool instead of writing the final answer.
When the user says "this year" or "so far this year", use the current year
shown above, never a previous year, in the search query.
If the user only asks today's date, answer using the current date below.
"""


class NvidiaApiError(RuntimeError):
    pass


def prepare_nvidia_web_search_decision(
    conversation: list[dict],
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> dict:
    if is_social_message(latest_user_message(conversation)):
        return {
            "needs_web_search": False,
            "answer": generate_nvidia_chat_response(
                conversation=conversation,
                model_name=model_name,
            ),
        }

    messages = _with_web_search_decision_prompt(
        _to_openai_messages(conversation)
    )
    response = _create_completion_from_messages(
        messages=messages,
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=False,
        tools=[WEB_SEARCH_TOOL],
        tool_choice="auto",
    )

    message = response.choices[0].message
    tool_calls = getattr(message, "tool_calls", None) or []

    for tool_call in tool_calls:
        function = getattr(tool_call, "function", None)

        if function is None or function.name != "web_search":
            continue

        query = _extract_tool_query(function.arguments)

        if not query:
            continue

        return {
            "needs_web_search": True,
            "query": query,
            "search_depth": _extract_search_depth(function.arguments),
            "include_images": _extract_include_images(function.arguments),
            "messages": messages,
            "assistant_message": _format_assistant_tool_message(message),
            "tool_call_id": tool_call.id,
        }

    textual_tool_call = _parse_textual_web_search_call(
        getattr(message, "content", None) or ""
    )

    if textual_tool_call:
        query = _normalize_current_year_query(
            textual_tool_call["query"],
            messages,
        )
        if query:
            call_id = "nvidia-web-search-text-call"
            return {
                "needs_web_search": True,
                "query": query,
                "search_depth": textual_tool_call["search_depth"],
                "messages": messages,
                "assistant_message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": "web_search",
                                "arguments": json.dumps(textual_tool_call),
                            },
                        }
                    ],
                },
                "tool_call_id": call_id,
            }

    answer = _clean_internal_content(message.content or "")
    return {
        "needs_web_search": False,
        "answer": answer,
    }


def stream_nvidia_web_search_decision(
    conversation: list[dict],
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> Iterator[dict]:
    latest_message = latest_user_message(conversation)
    if is_social_message(latest_message):
        for text in generate_nvidia_chat_response_stream(conversation, model_name):
            yield {"event": "chunk", "data": {"text": text}}
        return

    messages = _with_web_search_decision_prompt(
        _to_openai_messages(conversation)
    )
    response_stream = _create_completion_from_messages(
        messages=messages,
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=True,
        tools=[WEB_SEARCH_TOOL],
        tool_choice="auto",
    )

    tool_calls: dict[int, dict] = {}
    pending_text = ""
    output_filter = _NvidiaStreamTextFilter()

    for chunk in response_stream:
        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta
        for call_delta in getattr(delta, "tool_calls", None) or []:
            index = getattr(call_delta, "index", 0)
            call = tool_calls.setdefault(
                index,
                {
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""},
                },
            )
            if getattr(call_delta, "id", None):
                call["id"] = call_delta.id

            function_delta = getattr(call_delta, "function", None)
            if function_delta is not None:
                if getattr(function_delta, "name", None):
                    call["function"]["name"] += function_delta.name
                if getattr(function_delta, "arguments", None):
                    call["function"]["arguments"] += function_delta.arguments

        text = getattr(delta, "content", None)
        if not text:
            continue

        pending_text += text
        safe_text = output_filter.feed(text)
        if safe_text:
            yield {"event": "chunk", "data": {"text": safe_text}}

    safe_text = output_filter.finish()
    if safe_text:
        yield {"event": "chunk", "data": {"text": safe_text}}

    decision = _decision_from_streamed_tool_calls(tool_calls, messages)
    if decision is None and pending_text:
        textual_call = _parse_textual_web_search_call(pending_text)
        if textual_call:
            query = normalize_current_year_query(
                textual_call["query"],
                conversation,
            )
            decision = _build_synthetic_search_decision(
                query=query,
                search_depth=textual_call["search_depth"],
                messages=messages,
            )

    if decision:
        yield {"event": "search_request", "data": {"decision": decision}}


def generate_nvidia_chat_response_after_web_search(
    decision: dict,
    web_context: str,
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> str:
    response = _create_completion_from_messages(
        messages=_build_tool_result_messages(decision, web_context),
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=False,
    )

    return _clean_internal_content(response.choices[0].message.content or "")


def generate_nvidia_chat_response_stream_after_web_search(
    decision: dict,
    web_context: str,
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> Iterator[str]:
    response_stream = _create_completion_from_messages(
        messages=_build_tool_result_messages(decision, web_context),
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=True,
    )

    yield from _yield_stream_text(response_stream)


def generate_nvidia_chat_response(
    conversation: list[dict],
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> str:
    response = _create_completion(
        conversation=conversation,
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=False,
    )

    return _clean_internal_content(response.choices[0].message.content or "")


def generate_nvidia_chat_response_stream(
    conversation: list[dict],
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> Iterator[str]:
    response_stream = _create_completion(
        conversation=conversation,
        model_name=model_name,
        max_tokens=NVIDIA_CHAT_OUTPUT_TOKEN_LIMIT,
        stream=True,
    )

    yield from _yield_stream_text(response_stream)


def generate_nvidia_summary_response(
    conversation: list[dict],
    model_name: str = NVIDIA_NEMOTRON_MODEL_NAME,
) -> str:
    response = _create_completion(
        conversation=conversation,
        model_name=model_name,
        max_tokens=NVIDIA_SUMMARY_OUTPUT_TOKEN_LIMIT,
        stream=False,
    )

    return _clean_internal_content(response.choices[0].message.content or "")


def _create_completion(
    conversation: list[dict],
    model_name: str,
    max_tokens: int,
    stream: bool,
):
    return _create_completion_from_messages(
        messages=_to_openai_messages(conversation),
        model_name=model_name,
        max_tokens=max_tokens,
        stream=stream,
    )


def _create_completion_from_messages(
    messages: list[dict],
    model_name: str,
    max_tokens: int,
    stream: bool,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
):
    kwargs = {
        "model": model_name,
        "messages": messages,
        "temperature": 0.7,
        "top_p": 0.95,
        "max_tokens": max_tokens,
        "stream": stream,
        "extra_body": {
            "chat_template_kwargs": {
                "enable_thinking": False,
            },
        },
    }

    if tools is not None:
        kwargs["tools"] = tools

    if tool_choice is not None:
        kwargs["tool_choice"] = tool_choice

    try:
        return _get_client().chat.completions.create(**kwargs)
    except APIStatusError as error:
        if error.status_code == 429:
            raise NvidiaApiError(
                "NVIDIA quota limit reached. Please retry shortly."
            ) from error

        raise NvidiaApiError(
            f"NVIDIA request failed: {error.message}"
        ) from error


def _get_client() -> OpenAI:
    if not settings.NVIDIA_API_KEY:
        raise NvidiaApiError(
            "NVIDIA_API_KEY is missing from the backend .env file."
        )

    return OpenAI(
        base_url=NVIDIA_BASE_URL,
        api_key=settings.NVIDIA_API_KEY,
    )


def _to_openai_messages(conversation: list[dict]) -> list[dict]:
    messages: list[dict] = []

    for item in conversation:
        text = _extract_text(item)

        if not text:
            continue

        role = "assistant" if item.get("role") == "model" else "user"

        if text.startswith("Assistant Instructions"):
            role = "system"

        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n\n{text}"
            continue

        messages.append(
            {
                "role": role,
                "content": text,
            }
        )

    if not messages:
        raise NvidiaApiError("The NVIDIA request has no text content.")

    return messages


def _extract_text(item: dict) -> str:
    return "\n".join(
        part["text"].strip()
        for part in item.get("parts", [])
        if isinstance(part.get("text"), str) and part["text"].strip()
    )


def _yield_stream_text(response_stream) -> Iterator[str]:
    output_filter = _NvidiaStreamTextFilter()
    for chunk in response_stream:
        if not chunk.choices:
            continue

        text = chunk.choices[0].delta.content

        if text:
            safe_text = output_filter.feed(text)
            if safe_text:
                yield safe_text

    safe_text = output_filter.finish()
    if safe_text:
        yield safe_text


class _NvidiaStreamTextFilter:
    """Keep private reasoning and serialized tool syntax out of streamed replies."""

    _think_open = re.compile(r"(?:\\)?<\s*think\s*>", re.IGNORECASE)
    _think_close = re.compile(r"(?:\\)?<\s*/\s*think\s*>", re.IGNORECASE)
    _tool_start = re.compile(
        r"(?:\\)?<\s*tool(?:\\)?_call\b[^>]*>",
        re.IGNORECASE,
    )

    def __init__(self) -> None:
        self.pending = ""
        self.in_thinking = False
        self.finished = False

    def feed(self, text: str) -> str:
        self.pending += text
        visible: list[str] = []

        while self.pending and not self.finished:
            if self.in_thinking:
                close = self._think_close.search(self.pending)
                if close is None:
                    self.pending = self.pending[-16:]
                    break
                self.pending = self.pending[close.end():]
                self.in_thinking = False
                continue

            markers = [
                match
                for pattern in (self._think_open, self._think_close, self._tool_start)
                if (match := pattern.search(self.pending)) is not None
            ]
            if markers:
                marker = min(markers, key=lambda match: match.start())
                visible.append(self.pending[:marker.start()])
                self.pending = self.pending[marker.end():]
                if marker.re is self._think_open:
                    self.in_thinking = True
                else:
                    self.finished = True
                continue

            keep = 24
            if len(self.pending) > keep:
                visible.append(self.pending[:-keep])
                self.pending = self.pending[-keep:]
            break

        return "".join(visible)

    def finish(self) -> str:
        if self.in_thinking or self.finished:
            self.pending = ""
            return ""
        visible = _clean_internal_content(self.pending)
        self.pending = ""
        return visible


def _clean_internal_content(content: str) -> str:
    text = html.unescape(content).strip()
    text = re.sub(
        r"(?:\\)?<\s*think\s*>.*?(?:\\)?<\s*/\s*think\s*>",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"(?:\\)?<\s*think\s*>.*$",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"(?:\\)?<\s*/\s*think\s*>.*$",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"(?:\\)?<\s*tool(?:\\)?_call\b.*$",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return text.strip()


def _extract_tool_query(arguments: str | None) -> str | None:
    if not arguments:
        return None

    try:
        data = json.loads(arguments)
    except json.JSONDecodeError:
        return None

    query = data.get("query")

    if not isinstance(query, str):
        return None

    return query.strip() or None


def _extract_search_depth(arguments: str | None) -> str:
    if not arguments:
        return "basic"

    try:
        data = json.loads(arguments)
    except json.JSONDecodeError:
        return "basic"

    return "advanced" if data.get("search_depth") == "advanced" else "basic"


def _extract_include_images(arguments: str | None) -> bool:
    if not arguments:
        return False
    try:
        return json.loads(arguments).get("include_images") is True
    except (json.JSONDecodeError, AttributeError):
        return False


def _parse_textual_web_search_call(content: str) -> dict | None:
    if not re.search(r"\\?<tool_call\b", content, re.IGNORECASE):
        return None

    query_match = re.search(
        r"\\?<parameter\s*=\s*query\s*>(.*?)\\?</parameter\s*>",
        content,
        re.IGNORECASE | re.DOTALL,
    )
    if not query_match:
        return None

    query = query_match.group(1).strip().strip("\\\"' ")
    depth_match = re.search(
        r"\\?<parameter\s*=\s*search_depth\s*>(.*?)\\?</parameter\s*>",
        content,
        re.IGNORECASE | re.DOTALL,
    )
    depth = depth_match.group(1).strip().lower() if depth_match else "basic"

    if not query or not re.search(
        r"\\?<function\s*=\s*web_search\s*>",
        content,
        re.IGNORECASE,
    ):
        return None

    return {
        "query": query,
        "search_depth": "advanced" if depth == "advanced" else "basic",
    }


def _normalize_current_year_query(query: str, messages: list[dict]) -> str:
    latest_user_message = next(
        (
            item["content"]
            for item in reversed(messages)
            if item.get("role") == "user"
        ),
        "",
    )
    current_year = datetime.now().year
    relative_year_question = re.search(
        r"\b(this year|so far this year|year to date|till today|to date)\b",
        latest_user_message,
        re.IGNORECASE,
    )

    if not relative_year_question:
        return query

    normalized = re.sub(r"\b(?:19|20)\d{2}\b", str(current_year), query)

    if str(current_year) not in normalized:
        normalized = f"{current_year} {normalized}"

    return normalized


def _format_assistant_tool_message(message) -> dict:
    return {
        "role": "assistant",
        "content": message.content,
        "tool_calls": [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.function.name,
                    "arguments": tool_call.function.arguments,
                },
            }
            for tool_call in (getattr(message, "tool_calls", None) or [])
        ],
    }


def _decision_from_streamed_tool_calls(
    tool_calls: dict[int, dict],
    messages: list[dict],
) -> dict | None:
    for _, tool_call in sorted(tool_calls.items()):
        function = tool_call["function"]
        if function["name"] != "web_search":
            continue

        query = _extract_tool_query(function["arguments"])
        if not query:
            continue

        tool_call_id = tool_call["id"] or "nvidia-web-search-stream-call"
        tool_call["id"] = tool_call_id
        assistant_message = {
            "role": "assistant",
            "content": None,
            "tool_calls": [tool_call],
        }
        return {
            "needs_web_search": True,
            "query": normalize_current_year_query(query, messages),
            "search_depth": _extract_search_depth(function["arguments"]),
            "include_images": _extract_include_images(function["arguments"]),
            "messages": messages,
            "assistant_message": assistant_message,
            "tool_call_id": tool_call_id,
        }

    return None


def _build_synthetic_search_decision(
    query: str,
    search_depth: str,
    messages: list[dict],
) -> dict:
    tool_call_id = "nvidia-web-search-text-stream-call"
    arguments = json.dumps(
        {
            "query": query,
            "search_depth": search_depth,
        }
    )
    return {
        "needs_web_search": True,
        "query": query,
        "search_depth": search_depth,
        "messages": messages,
        "assistant_message": {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": "web_search",
                        "arguments": arguments,
                    },
                }
            ],
        },
        "tool_call_id": tool_call_id,
    }


def _build_tool_result_messages(
    decision: dict,
    web_context: str,
) -> list[dict]:
    return [
        *decision["messages"],
        decision["assistant_message"],
        {
            "role": "tool",
            "tool_call_id": decision["tool_call_id"],
            "name": "web_search",
            "content": web_context,
        },
    ]


def _with_web_search_decision_prompt(messages: list[dict]) -> list[dict]:
    today = datetime.now().strftime("%B %d, %Y")

    return [
        {
            "role": "system",
            "content": (
                f"Current date: {today}\n\n"
                f"{WEB_SEARCH_DECISION_PROMPT.strip()}\n\n"
                "When web results are provided, cite factual claims with Markdown "
                "links to their source URLs. If sources are insufficient, say so."
            ),
        },
        *messages,
    ]
