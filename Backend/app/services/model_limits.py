DEFAULT_MODEL_NAME = "gemini-3.6-flash"
MODEL_NAME = DEFAULT_MODEL_NAME
NVIDIA_NEMOTRON_MODEL_NAME = "nvidia/nemotron-3.5-lightning-30b-a3b"
CLOUDFLARE_QWEN_MODEL_NAME = "@cf/qwen/qwen3.8-27b"

CHAT_MODELS = {
    "gemini-3.5": "gemini-3.5-flash",
    "gemini-3.6": "gemini-3.6-flash",
    "gemini-3.7": "gemini-3.7-flash",
    "gemini-3.8": "gemini-3.8-flash",
    "nvidia-nemotron": NVIDIA_NEMOTRON_MODEL_NAME,
    "cloudflare-qwen": CLOUDFLARE_QWEN_MODEL_NAME,
}


def resolve_chat_model(
    requested_model: str | None,
) -> str:
    if not requested_model:
        return DEFAULT_MODEL_NAME

    return CHAT_MODELS.get(requested_model, DEFAULT_MODEL_NAME)


def is_nvidia_model(model_name: str) -> bool:
    return model_name == NVIDIA_NEMOTRON_MODEL_NAME


def is_cloudflare_model(model_name: str) -> bool:
    return model_name == CLOUDFLARE_QWEN_MODEL_NAME


def is_gemini_model(model_name: str) -> bool:
    return model_name in {
        CHAT_MODELS["gemini-3.5"],
        CHAT_MODELS["gemini-3.6"],
        CHAT_MODELS["gemini-3.7"],
        CHAT_MODELS["gemini-3.8"],
    }

# Gemini context budget used by this app.
TOTAL_CONTEXT_LIMIT = 1_048_576

# Reserved for the assistant answer in normal chat responses.
CHAT_OUTPUT_TOKEN_LIMIT = 40_000

# Summaries should stay small even when normal chat responses can be long.
SUMMARY_OUTPUT_TOKEN_LIMIT = 4_096

# Maximum input/history tokens we allow before summarizing.
INPUT_TOKEN_LIMIT = TOTAL_CONTEXT_LIMIT - CHAT_OUTPUT_TOKEN_LIMIT

# Exact recent messages preserved when older history is summarized.
RECENT_MESSAGE_LIMIT = 10

# For normal small chats, skip Gemini count_tokens calls.
SMALL_CHAT_MESSAGE_LIMIT = 20

# Local token estimate. This avoids extra Gemini API calls during normal use.
ESTIMATED_CHARS_PER_TOKEN = 4

# Only call Gemini count_tokens when local estimate is close to the limit.
LOCAL_TOKEN_ESTIMATE_SAFE_RATIO = 0.80
