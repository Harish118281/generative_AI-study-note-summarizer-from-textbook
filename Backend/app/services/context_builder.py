from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.models.message import Message
from app.system_prompt import select_prompts
from app.services.conversation_service import build_conversation
from app.services.message_service import (
    get_messages,
    get_recent_messages,
    get_unsummarized_messages,
)
from app.services.model_limits import DEFAULT_MODEL_NAME, RECENT_MESSAGE_LIMIT
from app.services.summary_service import (
    generate_summary,
    get_summary,
    save_summary,
)
from app.services.token_manager import fits_token_budget


IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


def get_runtime_context() -> str:
    now = datetime.now(IST_TIMEZONE)

    return (
        "System Runtime Information\n\n"
        f"Current date: {now.strftime('%B %d, %Y')}\n"
        f"Current time: {now.strftime('%I:%M %p')}\n"
        "Timezone: Asia/Kolkata (India Standard Time, IST)\n\n"
        "Use this information when the user asks for today's date, "
        "the current time, or other current system-time questions. "
        "Only include date or time when the user explicitly asks for it; "
        "do not volunteer it in greetings or unrelated answers."
    )


def build_prompt(
    messages: list[Message],
    summary: str | None = None,
    instruction_prompts: list[str] | None = None,
    custom_instructions: str | None = None,
    user_memory: str | None = None,
    book_chunks: list[str] | None = None,
    attached_file_parts: list[dict] | None = None,
    web_search: str | None = None,
) -> list[dict]:
    """
    Build a temporary prompt for Gemini.
    This returned context is not saved in the database.
    """

    prompt: list[dict] = []

    prompt.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": get_runtime_context()
                }
            ],
        }
    )

    if instruction_prompts:
        for instruction_prompt in instruction_prompts:
            prompt.append(
                {
                    "role": "user",
                    "system_instruction": True,
                    "parts": [
                        {
                            "text":
                            "Assistant Instructions\n\n"
                            f"{instruction_prompt.strip()}"
                        }
                    ],
                }
            )

    if custom_instructions and custom_instructions.strip():
        prompt.append(
            {
                "role": "user",
                "system_instruction": True,
                "parts": [
                    {
                        "text": (
                            "Assistant Instructions\n\n"
                            "Follow these user preferences when answering, unless they conflict "
                            "with safety or higher-priority instructions:\n"
                            f"{custom_instructions.strip()}"
                        )
                    }
                ],
            }
        )

    if user_memory:
        prompt.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text":
                        "User Memory\n\n"
                        f"{user_memory}"
                    }
                ],
            }
        )

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
        build_conversation(messages)
    )

    if book_chunks:
        prompt.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text":
                        "Relevant attached file context\n\n"
                        "Use this context when it helps answer the user's question. "
                        "If the context does not contain the answer, say so clearly.\n\n"
                        + "\n\n".join(book_chunks)
                    }
                ],
            }
        )

    if attached_file_parts:
        prompt.extend(attached_file_parts)

    if web_search:
        prompt.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text":
                        "Current web information\n\n"
                        f"{web_search}"
                    }
                ],
            }
        )

    return prompt


def summarize_old_messages_if_needed(
    db: Session,
    chat: Chat,
    summary: str | None,
    model_name: str = DEFAULT_MODEL_NAME,
) -> str | None:
    """
    When full history is too large, summarize only the old unsummarized chunk.
    The latest messages stay exact in the final prompt.
    """

    unsummarized_messages = get_unsummarized_messages(
        db=db,
        chat=chat,
    )

    messages_to_summarize = unsummarized_messages[:-RECENT_MESSAGE_LIMIT]

    if not messages_to_summarize:
        return summary

    conversation = build_conversation(
        messages_to_summarize
    )

    new_summary = generate_summary(
        previous_summary=summary,
        conversation=conversation,
        model_name=model_name,
    )

    save_summary(
        db=db,
        chat_id=chat.id,
        summary=new_summary,
        summarized_until_message_id=messages_to_summarize[-1].id,
    )

    return new_summary


def build_compact_prompt_that_fits(
    db: Session,
    chat_id: int,
    summary: str | None,
    instruction_prompts: list[str],
    custom_instructions: str | None = None,
    model_name: str = DEFAULT_MODEL_NAME,
    book_chunks: list[str] | None = None,
    attached_file_parts: list[dict] | None = None,
    web_search: str | None = None,
) -> list[dict]:
    """
    Build summary + recent messages and shrink the recent window only if needed.
    """

    recent_limit = RECENT_MESSAGE_LIMIT

    while recent_limit >= 0:
        recent_messages = get_recent_messages(
            db=db,
            chat_id=chat_id,
            limit=recent_limit,
        )

        prompt = build_prompt(
            messages=recent_messages,
            summary=summary,
            instruction_prompts=instruction_prompts,
            custom_instructions=custom_instructions,
            book_chunks=book_chunks,
            attached_file_parts=attached_file_parts,
            web_search=web_search,
        )

        if fits_token_budget(
            prompt,
            message_count=len(recent_messages),
            model=model_name,
        ):
            return prompt

        recent_limit -= 1

    raise ValueError(
        "Context is too large even after summarizing older messages."
    )


def prepare_prompt(
    db: Session,
    chat_id: int,
    model_name: str = DEFAULT_MODEL_NAME,
    book_chunks: list[str] | None = None,
    attached_file_parts: list[dict] | None = None,
    web_search: str | None = None,
) -> list[dict]:
    """
    Prepare the temporary LLM context for one request.

    Flow:
    1. Read this chat's full message history.
    2. Try the full conversation first.
    3. If it fits the input token budget, send full context.
    4. If it is too large, update the summary and send summary + recent messages.
    """

    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )

    if chat is None:
        raise ValueError("Chat not found.")

    summary = get_summary(
        db=db,
        chat_id=chat_id,
    )

    all_messages = get_messages(
        db=db,
        chat_id=chat_id,
    )

    instruction_prompts = select_prompts()
    custom_instructions = chat.user.custom_instructions if chat.user else None

    full_prompt = build_prompt(
        messages=all_messages,
        instruction_prompts=instruction_prompts,
        custom_instructions=custom_instructions,
        book_chunks=book_chunks,
        attached_file_parts=attached_file_parts,
        web_search=web_search,
    )

    if fits_token_budget(
        full_prompt,
        message_count=len(all_messages),
        model=model_name,
    ):
        return full_prompt

    summary = summarize_old_messages_if_needed(
        db=db,
        chat=chat,
        summary=summary,
        model_name=model_name,
    )

    return build_compact_prompt_that_fits(
        db=db,
        chat_id=chat_id,
        summary=summary,
        instruction_prompts=instruction_prompts,
        custom_instructions=custom_instructions,
        model_name=model_name,
        book_chunks=book_chunks,
        attached_file_parts=attached_file_parts,
        web_search=web_search,
    )


