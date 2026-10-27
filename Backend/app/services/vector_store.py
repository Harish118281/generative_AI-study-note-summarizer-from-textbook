import hashlib
import json
import math
from pathlib import Path


VECTOR_ROOT = Path(__file__).resolve().parents[2] / "storage" / "uploads" / "faiss"
VECTOR_SIZE = 128


def build_file_vector_index(
    file_hash: str,
    chunks: list[str],
) -> None:
    if not chunks:
        return

    VECTOR_ROOT.mkdir(parents=True, exist_ok=True)

    json_path = _json_index_path(file_hash)
    faiss_path = _faiss_index_path(file_hash)

    if json_path.exists() or faiss_path.exists():
        return

    vectors = [
        _hash_embedding(chunk)
        for chunk in chunks
    ]

    metadata = {
        "sha256_hash": file_hash,
        "embedding": "hashing-vector",
        "chunks": [
            {
                "chunk_index": index,
                "text": chunk,
            }
            for index, chunk in enumerate(chunks)
        ],
    }

    try:
        import faiss
        import numpy as np

        matrix = np.array(vectors, dtype="float32")
        index = faiss.IndexFlatIP(VECTOR_SIZE)
        index.add(matrix)
        faiss.write_index(index, str(faiss_path))
        json_path.write_text(
            json.dumps(metadata, ensure_ascii=False),
            encoding="utf-8",
        )
    except ImportError:
        metadata["faiss"] = "not-installed"
        metadata["vectors"] = vectors
        json_path.write_text(
            json.dumps(metadata, ensure_ascii=False),
            encoding="utf-8",
        )


def delete_file_vector_index(
    file_hash: str,
) -> None:
    for path in (
        _json_index_path(file_hash),
        _faiss_index_path(file_hash),
    ):
        if path.exists():
            path.unlink()


def _hash_embedding(
    text: str,
) -> list[float]:
    vector = [0.0] * VECTOR_SIZE

    for token in text.lower().split():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % VECTOR_SIZE
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    magnitude = math.sqrt(sum(value * value for value in vector)) or 1.0

    return [
        value / magnitude
        for value in vector
    ]


def _json_index_path(
    file_hash: str,
) -> Path:
    return VECTOR_ROOT / f"{file_hash}.json"


def _faiss_index_path(
    file_hash: str,
) -> Path:
    return VECTOR_ROOT / f"{file_hash}.index"
