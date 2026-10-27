from threading import Lock

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from app.core.config import settings


MODEL_NAME = "google/gemma-3-1b-it"
MAX_TITLE_TOKENS = 24

SYSTEM_PROMPT = (
    "You create a concise title for a chat. Read the first user message and "
    "the first assistant response, then infer the specific topic or purpose of "
    "that exchange. Make a fresh title that reflects its actual content; do not "
    "reuse a fixed title, template, or example. Give the user's message the most "
    "weight. Use the assistant response only to clarify the topic, and ignore "
    "generic conversational filler when it adds no subject. If the user has not "
    "introduced a subject or task, choose a neutral title matching the limited "
    "intent rather than inventing a request. Prefer concrete topic words over "
    "vague titles. Keep the title to 2-7 words. Return only the title, without "
    "quotes, ending punctuation, or explanation."
)

_model_lock = Lock()
_tokenizer = None
_model = None


def load_title_model():
    global _tokenizer, _model

    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    with _model_lock:
        if _tokenizer is not None and _model is not None:
            return _tokenizer, _model

        print("Loading Gemma title model...", flush=True)

        hf_token = settings.HF_TOKEN or None

        _tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            token=hf_token,
        )
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float32,
            device_map="cpu",
            token=hf_token,
        )
        _model.eval()

        print("Gemma title model loaded", flush=True)

    return _tokenizer, _model


def preload_title_model() -> None:
    try:
        load_title_model()
    except Exception as error:
        print(f"[Title] Gemma preload failed: {error}", flush=True)


def generate_chat_title(
    conversation: str,
) -> str:
    if not conversation.strip():
        return ""

    try:
        tokenizer, model = load_title_model()
        inputs = build_title_inputs(
            tokenizer=tokenizer,
            source_text=conversation,
        )

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=MAX_TITLE_TOKENS,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )

        prompt_token_count = inputs["input_ids"].shape[-1]
        title_ids = output_ids[0][prompt_token_count:]
        title = tokenizer.decode(
            title_ids,
            skip_special_tokens=True,
        )

        print(f"[Title] raw local Gemma title: {title!r}", flush=True)

        return title.strip().splitlines()[0].strip()
    except Exception as error:
        print(f"[Title] local Gemma title failed: {error}", flush=True)
        return ""


def build_title_inputs(
    tokenizer,
    source_text: str,
):
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": (
                "First user message and first assistant response:\n\n"
                f"{source_text.strip()}\n\n"
                "Title only:"
            ),
        },
    ]

    try:
        inputs = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
    except (ValueError, TypeError):
        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            "First user message and first assistant response:\n\n"
            f"{source_text.strip()}\n\n"
            "Title only:"
        )
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
        )

    return {
        key: value.to("cpu")
        for key, value in inputs.items()
    }
