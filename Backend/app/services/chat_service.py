import json
from threading import Lock, Thread

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.chat import Chat
from app.models.message import Message

from app.schemas.chat import (
    SendMessageResponse,
    MessageItem,
)

from app.services.llm_service import (
    generate_chat_response,
    generate_chat_response_events_stream,
)
from app.services.gemini import (
    generate_chat_response_events_stream as generate_gemini_chat_response_events_stream,
)
from app.services.nvidia import (
    generate_nvidia_chat_response_after_web_search,
    generate_nvidia_chat_response_stream_after_web_search,
    prepare_nvidia_web_search_decision,
    stream_nvidia_web_search_decision,
)

from app.services.message_service import (
    save_message,
    get_messages,
)

from app.services.context_builder import (
    prepare_prompt,
)
from app.services.file_rag_service import (
    attach_files_to_chat,
    get_chat_file_media_parts,
    retrieve_chat_file_context,
)
from app.services.model_limits import (
    is_cloudflare_model,
    is_gemini_model,
    is_nvidia_model,
    resolve_chat_model,
)
from app.services.tavily_web_search import (
    TavilySearchError,
    search_web_for_nvidia,
)
from app.services.title_service import (
    set_temporary_title_from_user_message,
    update_title_from_first_assistant_response,
)

_stream_locks: dict[int, Lock] = {}
_stream_locks_guard = Lock()


# -----------------------------
# Create Chat
# -----------------------------
def create_chat(
    db: Session,
    title: str,
    user_id: int,
) -> Chat:

    chat = Chat(
        title="New Chat",
        user_id=user_id,
    )

    db.add(chat)
    db.commit()
    db.refresh(chat)

    return chat


# -----------------------------
# Send Message
# -----------------------------
def send_message(
    db: Session,
    chat_id: int,
    message: str,
    user_id: int,
    model: str | None = None,
    attached_file_ids: list[int] | None = None,
    web_search_enabled: bool = True,
) -> SendMessageResponse:
    model_name = resolve_chat_model(model)
    chat = get_chat_model(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
    )

    if chat is None:
        raise ValueError("Chat not found.")

    if attached_file_ids:
        attach_files_to_chat(
            db=db,
            chat_id=chat_id,
            user_id=user_id,
            file_ids=attached_file_ids,
        )

    # Save user message
    save_message(
        db=db,
        chat_id=chat_id,
        role="user",
        content=message,
    )

    temporary_title = set_temporary_title_safely(
        db=db,
        chat_id=chat_id,
        message=message,
    )

    file_context = retrieve_chat_file_context(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
        question=message,
    )
    media_parts = (
        get_chat_file_media_parts(
            db=db,
            chat_id=chat_id,
            user_id=user_id,
        )
        if is_gemini_model(model_name)
        else []
    )

    # Build final prompt
    prompt = prepare_prompt(
        db=db,
        chat_id=chat_id,
        model_name=model_name,
        book_chunks=file_context,
        attached_file_parts=media_parts,
    )

    # Gemini uses this temporary context only for the current request.
    try:
        if is_nvidia_model(model_name):
            answer = generate_nvidia_answer_with_optional_web_search(
                prompt=prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            )
        elif is_cloudflare_model(model_name):
            answer = generate_chat_response(
                prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            )
        else:
            answer = generate_chat_response(
                prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            )
    finally:
        del prompt
        del file_context
        del media_parts

    # Save AI response
    save_message(
        db=db,
        chat_id=chat_id,
        role="assistant",
        content=answer,
    )

    schedule_title_update_safely(db=db, chat_id=chat_id)

    return SendMessageResponse(
        answer=answer,
        title=temporary_title,
    )


def stream_message(
    db: Session,
    chat_id: int,
    message: str,
    user_id: int,
    model: str | None = None,
    attached_file_ids: list[int] | None = None,
    resume_existing_message: bool = False,
    web_search_enabled: bool = True,
):
    with _stream_locks_guard:
        stream_lock = _stream_locks.setdefault(chat_id, Lock())

    with stream_lock:
        message_to_generate = message
        if resume_existing_message:
            existing_messages = get_messages(db=db, chat_id=chat_id)
            if existing_messages and existing_messages[-1].role == "assistant":
                existing_answer = existing_messages[-1].content.strip()
                if existing_answer:
                    yield format_stream_event(
                        "chunk",
                        {"text": existing_answer},
                    )
                    yield format_stream_event(
                        "answer_done",
                        {"answer": existing_answer},
                    )
                    yield format_stream_event(
                        "done",
                        {
                            "answer": existing_answer,
                            "title": get_chat_model(
                                db=db,
                                chat_id=chat_id,
                                user_id=user_id,
                            ).title,
                        },
                    )
                    return

            if not existing_messages or existing_messages[-1].role != "user":
                yield format_stream_event(
                    "error",
                    {"detail": "There is no unfinished response to resume."},
                )
                return

            message_to_generate = existing_messages[-1].content

        yield from _stream_message_impl(
            db=db,
            chat_id=chat_id,
            message=message_to_generate,
            user_id=user_id,
            model=model,
            attached_file_ids=attached_file_ids,
            save_user_message=not resume_existing_message,
            web_search_enabled=web_search_enabled,
        )


def _stream_message_impl(
    db: Session,
    chat_id: int,
    message: str,
    user_id: int,
    model: str | None,
    attached_file_ids: list[int] | None,
    save_user_message: bool,
    web_search_enabled: bool,
):
    prompt = None
    answer_parts: list[str] = []
    model_name = resolve_chat_model(model)

    try:
        chat = get_chat_model(
            db=db,
            chat_id=chat_id,
            user_id=user_id,
        )

        if chat is None:
            raise ValueError("Chat not found.")

        if save_user_message and attached_file_ids:
            attach_files_to_chat(
                db=db,
                chat_id=chat_id,
                user_id=user_id,
                file_ids=attached_file_ids,
            )

        if save_user_message:
            save_message(
                db=db,
                chat_id=chat_id,
                role="user",
                content=message,
            )

            temporary_title = set_temporary_title_safely(
                db=db,
                chat_id=chat_id,
                message=message,
            )
        else:
            temporary_title = chat.title

        if temporary_title:
            yield format_stream_event(
                event="title",
                data={
                    "title": temporary_title,
                },
            )

        file_context = retrieve_chat_file_context(
            db=db,
            chat_id=chat_id,
            user_id=user_id,
            question=message,
        )
        media_parts = (
            get_chat_file_media_parts(
                db=db,
                chat_id=chat_id,
                user_id=user_id,
            )
            if is_gemini_model(model_name)
            else []
        )

        prompt = prepare_prompt(
            db=db,
            chat_id=chat_id,
            model_name=model_name,
            book_chunks=file_context,
            attached_file_parts=media_parts,
        )

        if is_nvidia_model(model_name):
            for event in stream_nvidia_answer_with_optional_web_search(
                prompt=prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            ):
                if event["event"] == "chunk":
                    answer_parts.append(event["text"])

                yield format_stream_event(
                    event=event["event"],
                    data=event["data"],
                )
        elif is_cloudflare_model(model_name):
            for event in generate_chat_response_events_stream(
                conversation=prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            ):
                if event["event"] == "chunk":
                    answer_parts.append(event["data"]["text"])
                yield format_stream_event(event["event"], event["data"])
        else:
            for event in generate_gemini_chat_response_events_stream(
                conversation=prompt,
                model_name=model_name,
                web_search_enabled=web_search_enabled,
            ):
                if event["event"] == "chunk":
                    answer_parts.append(event["data"]["text"])
                yield format_stream_event(
                    event=event["event"],
                    data=event["data"],
                )

        answer = "".join(answer_parts).strip()

        if not answer:
            raise ValueError("The assistant returned an empty response.")

        save_message(
            db=db,
            chat_id=chat_id,
            role="assistant",
            content=answer,
        )

        schedule_title_update_safely(db=db, chat_id=chat_id)

        yield format_stream_event(
            event="answer_done",
            data={
                "answer": answer,
            },
        )

        yield format_stream_event(
            event="done",
            data={
                "answer": answer,
                "title": temporary_title,
            },
        )

    except Exception as error:
        yield format_stream_event(
            event="error",
            data={
                "detail": str(error),
            },
        )

    finally:
        if prompt is not None:
            del prompt

        if "file_context" in locals():
            del file_context

        if "media_parts" in locals():
            del media_parts


def format_stream_event(
    event: str,
    data: dict,
) -> str:
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data)}\n\n"
    )


def set_temporary_title_safely(
    db: Session,
    chat_id: int,
    message: str,
) -> str | None:
    try:
        return set_temporary_title_from_user_message(
            db=db,
            chat_id=chat_id,
            user_message=message,
        )
    except Exception as error:
        print(
            f"[Title] temporary title failed: {error}",
            flush=True,
        )
        return None


def update_final_title_safely(
    db: Session,
    chat_id: int,
    assistant_response: str,
) -> str | None:
    try:
        return update_title_from_first_assistant_response(
            db=db,
            chat_id=chat_id,
            assistant_response=assistant_response,
        )
    except Exception as error:
        print(
            f"[Title] final title failed: {error}",
            flush=True,
        )
        return None


def schedule_title_update_safely(db: Session, chat_id: int) -> None:
    try:
        first_user_message = (
            db.query(Message)
            .filter(Message.chat_id == chat_id, Message.role == "user")
            .order_by(Message.id.asc())
            .first()
        )
        assistant_count = (
            db.query(Message)
            .filter(Message.chat_id == chat_id, Message.role == "assistant")
            .count()
        )

        if first_user_message is None or assistant_count != 1:
            return

        Thread(
            target=_generate_title_in_background,
            args=(chat_id,),
            daemon=True,
        ).start()
    except Exception as error:
        print(f"[Title] could not schedule title generation: {error}", flush=True)


def _generate_title_in_background(chat_id: int) -> None:
    try:
        title_db = SessionLocal()
        try:
            update_final_title_safely(
                db=title_db,
                chat_id=chat_id,
                assistant_response="",
            )
        finally:
            title_db.close()
    except Exception as error:
        print(f"[Title] background title generation failed: {error}", flush=True)


def generate_nvidia_answer_with_optional_web_search(
    prompt: list[dict],
    model_name: str,
    web_search_enabled: bool = True,
) -> str:
    if not web_search_enabled:
        from app.services.nvidia import generate_nvidia_chat_response

        return generate_nvidia_chat_response(prompt, model_name=model_name)

    decision = prepare_nvidia_web_search_decision(
        conversation=prompt,
        model_name=model_name,
    )

    if not decision.get("needs_web_search"):
        answer = decision.get("answer")

        if isinstance(answer, str) and answer.strip():
            return answer.strip()

        raise ValueError("The assistant returned an empty response.")

    web_context = get_nvidia_web_context_safely(
        message=decision["query"],
        search_depth=decision.get("search_depth", "basic"),
        model_name=model_name,
        include_images=decision.get("include_images", False),
    )

    if not web_context:
        web_context = "Web search was requested, but no results were available."

    return generate_nvidia_chat_response_after_web_search(
        decision=decision,
        web_context=web_context,
        model_name=model_name,
    )


def stream_nvidia_answer_with_optional_web_search(
    prompt: list[dict],
    model_name: str,
    web_search_enabled: bool = True,
):
    if not web_search_enabled:
        from app.services.nvidia import generate_nvidia_chat_response_stream

        for text in generate_nvidia_chat_response_stream(prompt, model_name=model_name):
            yield {"event": "chunk", "text": text, "data": {"text": text}}
        return

    decision = None
    for event in stream_nvidia_web_search_decision(
        conversation=prompt,
        model_name=model_name,
    ):
        if event["event"] == "search_request":
            decision = event["data"]["decision"]
            break

        if event["event"] == "chunk":
            text = event["data"]["text"]
            yield {
                "event": "chunk",
                "text": text,
                "data": {
                    "text": text,
                },
            }

    if decision is None:
        return

    yield {
        "event": "web_search",
        "data": {
            "status": "started",
            "message": "Searching images..." if decision.get("include_images") else "Web searching...",
        },
    }

    web_context = get_nvidia_web_context_safely(
        message=decision["query"],
        search_depth=decision.get("search_depth", "basic"),
        model_name=model_name,
        include_images=decision.get("include_images", False),
    )

    yield {
        "event": "web_search",
        "data": {
            "status": "finished",
            "message": (
                "Images found" if decision.get("include_images") and web_context
                else "Web search complete" if web_context
                else "Web search unavailable"
            ),
        },
    }

    if not web_context:
        web_context = "Web search was requested, but no results were available."

    for chunk in generate_nvidia_chat_response_stream_after_web_search(
        decision=decision,
        web_context=web_context,
        model_name=model_name,
    ):
        yield {
            "event": "chunk",
            "text": chunk,
            "data": {
                "text": chunk,
            },
        }


def get_nvidia_web_context_safely(
    message: str,
    search_depth: str,
    model_name: str,
    include_images: bool = False,
) -> str | None:
    if not is_nvidia_model(model_name):
        return None

    try:
        return search_web_for_nvidia(
            message,
            search_depth=search_depth,
            include_images=include_images,
        )
    except TavilySearchError as error:
        print(
            f"[Tavily] web search failed: {error}",
            flush=True,
        )
        return None


# -----------------------------
# Get All Chats
# -----------------------------
def get_all_chats(
    db: Session,
    user_id: int,
):

    return (
        db.query(Chat)
        .filter(Chat.user_id == user_id)
        .order_by(Chat.updated_at.desc())
        .all()
    )


# -----------------------------
# Get One Chat
# -----------------------------
def get_chat(
    db: Session,
    chat_id: int,
    user_id: int,
):

    chat = get_chat_model(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
    )

    if chat is None:
        return None

    messages = get_messages(
        db=db,
        chat_id=chat_id,
    )

    return {
        "id": chat.id,
        "title": chat.title,
        "messages": [
            MessageItem(
                role=message.role,
                content=message.content,
                created_at=message.created_at,
            )
            for message in messages
        ],
    }


# -----------------------------
# Delete Chat
# -----------------------------
def delete_chat(
    db: Session,
    chat_id: int,
    user_id: int,
):

    chat = get_chat_model(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
    )

    if chat is None:
        return False

    db.delete(chat)
    db.commit()

    return True


def rename_chat(
    db: Session,
    chat_id: int,
    user_id: int,
    title: str,
) -> Chat | None:
    chat = get_chat_model(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
    )

    if chat is None:
        return None

    cleaned_title = " ".join(title.strip().split())

    if not cleaned_title:
        raise ValueError("Title cannot be empty.")

    chat.title = cleaned_title[:80]
    db.commit()
    db.refresh(chat)

    return chat


def get_chat_model(
    db: Session,
    chat_id: int,
    user_id: int,
) -> Chat | None:
    return (
        db.query(Chat)
        .filter(
            Chat.id == chat_id,
            Chat.user_id == user_id,
        )
        .first()
    )
