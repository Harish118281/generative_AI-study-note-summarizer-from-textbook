from datetime import datetime

from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.services.llm_service import generate_summary_response
from app.services.model_limits import DEFAULT_MODEL_NAME


SUMMARY_PROMPT = """
You are a conversation memory manager.

Your job is to update an existing conversation summary.

Rules:

- Keep all important information from the previous summary.
- Add important information from the new conversation.
- Preserve user preferences.
- Preserve important decisions.
- Preserve important explanations.
- Preserve unresolved questions.
- Remove greetings.
- Remove repeated information.
- Keep the summary concise.
"""


# --------------------------------------------------
# Generate New Summary
# --------------------------------------------------
def generate_summary(
    previous_summary: str | None,
    conversation: list[dict],
    model_name: str = DEFAULT_MODEL_NAME,
) -> str:

    prompt = []

    prompt.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": SUMMARY_PROMPT
                }
            ],
        }
    )

    # Existing summary
    if previous_summary:

        prompt.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text":
                        "Existing Summary:\n\n"
                        f"{previous_summary}"
                    }
                ],
            }
        )

    # New conversation
    prompt.append(
        {
            "role": "user",
            "parts": [
                {
                    "text":
                    "Update the summary using the following conversation."
                }
            ],
        }
    )

    prompt.extend(conversation)

    return generate_summary_response(
        conversation=prompt,
        model_name=model_name,
    )


# --------------------------------------------------
# Get Summary
# --------------------------------------------------
def get_summary(
    db: Session,
    chat_id: int,
) -> str | None:

    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )

    if chat is None:
        return None

    return chat.summary


# --------------------------------------------------
# Save Summary
# --------------------------------------------------
def save_summary(
    db: Session,
    chat_id: int,
    summary: str,
    summarized_until_message_id: int,
) -> None:

    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )

    if chat is None:
        return

    chat.summary = summary

    chat.summarized_until_message_id = (
        summarized_until_message_id
    )

    chat.summary_updated_at = datetime.utcnow()

    db.commit()


# --------------------------------------------------
# Get Chat
# --------------------------------------------------
def get_chat(
    db: Session,
    chat_id: int,
) -> Chat | None:

    return (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )
