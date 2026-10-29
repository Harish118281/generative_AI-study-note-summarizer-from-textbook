from functools import lru_cache

from google import genai
from google.genai import types

from app.core.config import settings


EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
EMBEDDING_BATCH_SIZE = 32


@lru_cache(maxsize=1)
def _client():
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def embed_texts(texts: list[str], task_type: str) -> list[list[float]]:
    """Return normalized Gemini embeddings, preserving input order."""
    if not texts:
        return []

    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[start : start + EMBEDDING_BATCH_SIZE]
        response = _client().models.embed_content(
            model=EMBEDDING_MODEL,
            contents=batch,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        )
        embeddings = response.embeddings or []
        if len(embeddings) != len(batch):
            raise RuntimeError("Embedding provider returned an unexpected result count.")
        vectors.extend([list(item.values) for item in embeddings])

    return vectors
