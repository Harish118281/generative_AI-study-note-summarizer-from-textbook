import re

from google import genai
from google.genai import errors, types

from app.core.config import settings
from app.services.model_limits import (
    CHAT_OUTPUT_TOKEN_LIMIT,
    DEFAULT_MODEL_NAME,
    SUMMARY_OUTPUT_TOKEN_LIMIT,
)
from app.services.gemini_usage_logger import log_gemini_call
from app.services.tavily_web_search import search_web
from app.services.web_search_policy import (
    is_social_message,
    latest_user_message,
    normalize_current_year_query,
)


client = genai.Client(
    api_key=settings.GEMINI_API_KEY
)


MAX_CHAT_CONTINUATIONS = 2

CONTINUE_RESPONSE_PROMPT = """
Continue the previous answer exactly from where it stopped.
Do not repeat already written content.
Finish with complete sentences.
"""

WEB_SEARCH_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="web_search",
            description=(
                "Search the web for current, latest, recent, live, or "
                "time-sensitive information, when explicitly requested, or to "
                "retrieve useful real-world images for a visual explanation. "
                "Do not search stable facts unless images materially help."
            ),
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A concise web search query.",
                    },
                    "search_depth": {
                        "type": "string",
                        "enum": ["basic", "advanced"],
                        "description": "Use advanced for explicit deep or comprehensive research; otherwise basic.",
                    },
                    "include_images": {
                        "type": "boolean",
                        "description": "Include relevant real-world images only when they significantly improve the answer.",
                    },
                },
                "required": ["query"],
            },
        )
    ]
)

WEB_SEARCH_DECISION_PROMPT = """
Decide whether this question needs web research before answering.
Search for current, latest, recent, live, or time-sensitive facts; news and
events; current releases, prices, laws, schedules, weather, sports, software
versions, or facts likely to have changed. Search whenever the user asks to
search the web or requests deep, comprehensive, or source-backed research.
Use advanced search depth only for explicit deep/comprehensive research;
otherwise use basic. Do not search stable general knowledge unless useful
real-world images would materially improve the explanation. Do not search
questions asking only for today's date, which is in the conversation context. If you search,
wait for results, ground the answer in them, and cite factual claims with
Markdown links using the returned URLs. If sources are insufficient, say so.
When real-world images would substantially improve the explanation (for example,
showing a real device, place, animal, or visible process), call the tool even if
the facts are stable and set include_images=true. For this visual-only search,
choose a query for the relevant example images. Do not request images for
greetings, purely abstract concepts, or when visuals add little.
When image results are provided, include up to three relevant Markdown images
in a compact row, each linked to its supplied source URL. Never invent image URLs.
""".strip()

WEB_SEARCH_ANSWER_PROMPT = (
    "Answer using the web search results in the conversation. Ground current "
    "factual claims in those results and cite them with Markdown links using "
    "the exact returned source URLs. Do not invent citations. If the sources do "
    "not establish an answer, say so clearly. If visual results are present and "
    "materially help, include up to three supplied Markdown images in one compact "
    "row, linked to their source pages; never invent image URLs. Keep any image "
    "gallery close to the explanation it illustrates."
)


class GeminiQuotaError(RuntimeError):
    pass


def _format_retry_delay(retry_delay: str | None) -> str:
    if not retry_delay:
        return "Please try again later."

    seconds_match = re.match(r"^(\d+(?:\.\d+)?)s$", retry_delay)

    if not seconds_match:
        return f"Please retry in {retry_delay}."

    seconds = round(float(seconds_match.group(1)))

    if seconds <= 1:
        return "Please retry in 1 second."

    return f"Please retry in about {seconds} seconds."


def _extract_retry_delay(error: errors.APIError) -> str | None:
    response_json = getattr(error, "response_json", None)

    if not isinstance(response_json, dict):
        retry_match = re.search(r"'retryDelay': '([^']+)'", str(error))
        return retry_match.group(1) if retry_match else None

    details = response_json.get("error", {}).get("details", [])

    for detail in details:
        if not isinstance(detail, dict):
            continue

        retry_delay = detail.get("retryDelay")

        if isinstance(retry_delay, str):
            return retry_delay

    return None


def _raise_clean_gemini_error(error: errors.APIError) -> None:
    if error.code == 429:
        retry_message = _format_retry_delay(
            _extract_retry_delay(error)
        )
        raise GeminiQuotaError(
            "Gemini quota limit reached. "
            f"{retry_message}"
        ) from error

    raise error


def _get_response_text(response) -> str:
    return response.text or ""


def _get_finish_reason(response) -> str | None:
    if not response.candidates:
        return None

    finish_reason = response.candidates[0].finish_reason

    if finish_reason is None:
        return None

    return getattr(finish_reason, "name", str(finish_reason))


def _stopped_by_output_limit(response) -> bool:
    return _get_finish_reason(response) == "MAX_TOKENS"


def _get_chat_config(
    enable_web_search: bool = False,
    answer_from_search: bool = False,
    conversation: list | None = None,
) -> types.GenerateContentConfig:
    system_instructions = _extract_custom_instructions(conversation or [])
    if enable_web_search:
        system_instructions.append(WEB_SEARCH_DECISION_PROMPT)
    elif answer_from_search:
        system_instructions.append(WEB_SEARCH_ANSWER_PROMPT)

    return types.GenerateContentConfig(
        maxOutputTokens=CHAT_OUTPUT_TOKEN_LIMIT,
        tools=[WEB_SEARCH_TOOL] if enable_web_search else None,
        systemInstruction="\n\n".join(system_instructions) or None,
    )


def _extract_custom_instructions(conversation: list) -> list[str]:
    instructions: list[str] = []
    for item in conversation:
        if not isinstance(item, dict) or item.get("system_instruction") is not True:
            continue
        if isinstance(item, dict):
            parts = item.get("parts", [])
        else:
            parts = getattr(item, "parts", []) or []
        for part in parts:
            text = part.get("text") if isinstance(part, dict) else getattr(part, "text", None)
            if isinstance(text, str):
                instructions.append(text.strip())
    return instructions


def _to_gemini_contents(conversation: list) -> list:
    """Remove app-only metadata before passing content objects to the Gemini SDK."""
    return [
        {key: value for key, value in item.items() if key != "system_instruction"}
        if isinstance(item, dict)
        else item
        for item in conversation
    ]


def _find_web_search_call(response):
    if not response.candidates:
        return None, None

    content = response.candidates[0].content

    if content is None:
        return None, None

    for part in content.parts or []:
        function_call = getattr(part, "function_call", None)

        if function_call and function_call.name == "web_search":
            return function_call, content

    return None, content


def _generate_initial_chat_response(
    conversation: list[dict],
    model_name: str,
    web_search_enabled: bool = True,
):
    skip_web_search = (
        not web_search_enabled
        or is_social_message(latest_user_message(conversation))
    )
    try:
        log_gemini_call("chat search decision generate_content", model_name)
        response = client.models.generate_content(
            model=model_name,
            contents=_to_gemini_contents(conversation),
            config=_get_chat_config(
                enable_web_search=not skip_web_search,
                conversation=conversation,
            ),
        )
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    function_call, model_content = _find_web_search_call(response)

    if function_call is None:
        return response, conversation

    arguments = function_call.args or {}
    query = arguments.get("query")
    search_depth = arguments.get("search_depth", "basic")
    include_images = arguments.get("include_images") is True
    if not isinstance(query, str) or not query.strip():
        return response, conversation
    query = normalize_current_year_query(query, conversation)

    try:
        web_context = search_web(
            query,
            search_depth=search_depth,
            include_images=include_images,
        )
    except Exception as error:
        print(f"[Tavily] Gemini web search failed: {error}", flush=True)
        web_context = None

    if not web_context:
        web_context = "No web results were available for this search."

    function_response = types.Part.from_function_response(
        name=function_call.name,
        response={"results": web_context},
    )
    follow_up_contents = [
        *conversation,
        model_content,
        types.Content(role="user", parts=[function_response]),
    ]

    try:
        log_gemini_call("chat response after Tavily search", model_name)
        response = client.models.generate_content(
            model=model_name,
            contents=_to_gemini_contents(follow_up_contents),
            config=_get_chat_config(answer_from_search=True, conversation=follow_up_contents),
        )
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    if not _get_response_text(response).strip():
        try:
            log_gemini_call("chat search-context fallback generate_content", model_name)
            response = client.models.generate_content(
                model=model_name,
                contents=_to_gemini_contents(_build_search_fallback_contents(conversation, web_context)),
                config=_get_chat_config(answer_from_search=True, conversation=conversation),
            )
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

    return response, follow_up_contents


def generate_chat_response(
    conversation: list[dict],
    model_name: str = DEFAULT_MODEL_NAME,
    web_search_enabled: bool = True,
) -> str:

    try:
        response, continuation_context = _generate_initial_chat_response(
            conversation,
            model_name,
            web_search_enabled,
        )
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    answer = _get_response_text(response)
    continuation_count = 0

    while (
        _stopped_by_output_limit(response)
        and continuation_count < MAX_CHAT_CONTINUATIONS
    ):
        temporary_context = [
            *continuation_context,
            {
                "role": "model",
                "parts": [
                    {
                        "text": answer,
                    }
                ],
            },
            {
                "role": "user",
                "parts": [
                    {
                        "text": CONTINUE_RESPONSE_PROMPT,
                    }
                ],
            },
        ]

        try:
            log_gemini_call("chat continuation generate_content", model_name)
            response = client.models.generate_content(
                model=model_name,
                contents=_to_gemini_contents(temporary_context),
                config=_get_chat_config(conversation=temporary_context),
            )
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

        answer += _get_response_text(response)
        continuation_count += 1

    return answer


def generate_chat_response_stream(
    conversation: list[dict],
    model_name: str = DEFAULT_MODEL_NAME,
):
    for event in generate_chat_response_events_stream(
        conversation,
        model_name,
    ):
        if event["event"] == "chunk":
            yield event["data"]["text"]


def generate_chat_response_events_stream(
    conversation: list[dict],
    model_name: str = DEFAULT_MODEL_NAME,
    web_search_enabled: bool = True,
):
    skip_web_search = (
        not web_search_enabled
        or is_social_message(latest_user_message(conversation))
    )
    try:
        log_gemini_call("chat initial response stream", model_name)
        response_stream = client.models.generate_content_stream(
            model=model_name,
            contents=_to_gemini_contents(conversation),
            config=_get_chat_config(
                enable_web_search=not skip_web_search,
                conversation=conversation,
            ),
        )
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    answer = ""
    continuation_context = conversation
    search_context_for_fallback = None
    function_call = None
    model_content = None
    last_response = None

    try:
        for response in response_stream:
            last_response = response
            candidate_call, candidate_content = _find_web_search_call(response)

            if candidate_call is not None:
                function_call = candidate_call
                model_content = candidate_content
                continue

            chunk = _get_response_text(response)
            if chunk:
                answer += chunk
                yield {
                    "event": "chunk",
                    "data": {"text": chunk},
                }
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    if function_call is not None:
        query = (function_call.args or {}).get("query")
        if isinstance(query, str) and query.strip():
            query = normalize_current_year_query(query, conversation)
            yield {
                "event": "web_search",
                "data": {
                    "status": "started",
                    "message": "Searching images..." if (function_call.args or {}).get("include_images") is True else "Web searching...",
                },
            }

            try:
                arguments = function_call.args or {}
                search_depth = arguments.get("search_depth", "basic")
                include_images = arguments.get("include_images") is True
                web_context = search_web(
                    query,
                    search_depth=search_depth,
                    include_images=include_images,
                )
            except Exception as error:
                print(f"[Tavily] Gemini web search failed: {error}", flush=True)
                web_context = None

            yield {
                "event": "web_search",
                "data": {
                    "status": "finished",
                    "message": (
                        "Images found" if include_images and web_context
                        else "Web search complete" if web_context
                        else "Web search unavailable"
                    ),
                },
            }

            if not web_context:
                web_context = "No web results were available for this search."

            search_context_for_fallback = web_context

            function_response = types.Part.from_function_response(
                name=function_call.name,
                response={"results": web_context},
            )
            continuation_context = [
                *conversation,
                model_content,
                types.Content(role="user", parts=[function_response]),
            ]

            try:
                log_gemini_call("chat response after Tavily search stream", model_name)
                response_stream = client.models.generate_content_stream(
                    model=model_name,
                    contents=_to_gemini_contents(continuation_context),
                    config=_get_chat_config(answer_from_search=True, conversation=continuation_context),
                )
            except errors.APIError as error:
                _raise_clean_gemini_error(error)

            last_response = None
            try:
                for response in response_stream:
                    last_response = response
                    chunk = _get_response_text(response)

                    if chunk:
                        answer += chunk
                        yield {
                            "event": "chunk",
                            "data": {"text": chunk},
                        }
            except errors.APIError as error:
                _raise_clean_gemini_error(error)

    if not answer.strip() and search_context_for_fallback:
        try:
            log_gemini_call("chat search-context fallback stream", model_name)
            fallback_stream = client.models.generate_content_stream(
                model=model_name,
                contents=_to_gemini_contents(
                    _build_search_fallback_contents(conversation, search_context_for_fallback)
                ),
                config=_get_chat_config(answer_from_search=True, conversation=conversation),
            )
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

        try:
            for response in fallback_stream:
                last_response = response
                chunk = _get_response_text(response)

                if chunk:
                    answer += chunk
                    yield {
                        "event": "chunk",
                        "data": {"text": chunk},
                    }
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

    continuation_count = 0

    while (
        last_response is not None
        and _stopped_by_output_limit(last_response)
        and continuation_count < MAX_CHAT_CONTINUATIONS
    ):
        temporary_context = [
            *continuation_context,
            {
                "role": "model",
                "parts": [
                    {
                        "text": answer,
                    }
                ],
            },
            {
                "role": "user",
                "parts": [
                    {
                        "text": CONTINUE_RESPONSE_PROMPT,
                    }
                ],
            },
        ]

        try:
            log_gemini_call("chat continuation generate_content_stream", model_name)
            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=_to_gemini_contents(temporary_context),
                config=_get_chat_config(conversation=temporary_context),
            )
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

        last_response = None

        try:
            for response in response_stream:
                last_response = response
                chunk = _get_response_text(response)

                if chunk:
                    answer += chunk
                    yield {
                        "event": "chunk",
                        "data": {"text": chunk},
                    }
        except errors.APIError as error:
            _raise_clean_gemini_error(error)

        continuation_count += 1


def _build_search_fallback_contents(
    conversation: list[dict],
    web_context: str,
) -> list:
    return [
        *conversation,
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        "Search results from the web:\n\n"
                        f"{web_context}\n\n"
                        "Answer the latest user question using these results. "
                        "Cite factual claims with Markdown links to the exact "
                        "source URLs above. Do not invent sources."
                    )
                )
            ],
        ),
    ]


def generate_summary_response(
    conversation: list[dict],
    model_name: str = DEFAULT_MODEL_NAME,
) -> str:

    try:
        log_gemini_call("summary generate_content", model_name)
        response = client.models.generate_content(
            model=model_name,
            contents=_to_gemini_contents(conversation),
            config=types.GenerateContentConfig(
                maxOutputTokens=SUMMARY_OUTPUT_TOKEN_LIMIT,
            ),
        )
    except errors.APIError as error:
        _raise_clean_gemini_error(error)

    return _get_response_text(response)
