from app.models.message import Message


def build_conversation(messages: list[Message]) -> list[dict]:
    """
    Convert database messages into the format expected by the Gemini API.
    Consecutive user messages can occur when earlier model requests failed;
    only the latest message in that run is a live request for the assistant.
    """

    conversation = []

    for message in messages:

        role = "user"

        if message.role == "assistant":
            role = "model"

        item = {
            "role": role,
            "parts": [
                {
                    "text": message.content
                }
            ],
        }

        if role == "user" and conversation and conversation[-1]["role"] == "user":
            conversation[-1] = item
        else:
            conversation.append(item)

    return conversation
