import base64
import hashlib
import math
import mimetypes
import re
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.models.file_library import ChatFile, FileChunk, FileLibrary
from app.core.config import settings
from app.services.object_storage import (
    build_file_object_key,
    delete_file_object,
    get_file_object,
    is_object_storage_reference,
    object_key_from_reference,
    object_storage_is_configured,
    object_storage_reference,
    put_file_object,
)
from app.services.embedding_service import embed_texts


BACKEND_DIR = Path(__file__).resolve().parents[2]
STORAGE_ROOT = BACKEND_DIR / "storage"
UPLOAD_ROOT = STORAGE_ROOT / "uploads"
LEGACY_UPLOAD_ROOT = BACKEND_DIR / "uploads"
MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024
CHUNK_SIZE = 1800
CHUNK_OVERLAP = 250
MAX_CONTEXT_CHUNKS = 5
MAX_CONTEXT_CHARS = 10000
MAX_INLINE_MEDIA_BYTES = 20 * 1024 * 1024

CATEGORY_FOLDERS = {
    "documents": "documents",
    "images": "images",
    "audio": "audio",
    "video": "video",
    "archive": "archive",
    "code": "code",
    "others": "others",
}

DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".md",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".csv",
}

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".avif",
    ".bmp",
}

AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".ogg",
}

VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
}

ARCHIVE_EXTENSIONS = {
    ".zip",
    ".rar",
    ".7z",
}

CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".java",
    ".html",
    ".css",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".sql",
    ".sh",
    ".ps1",
}

TEXT_LIKE_EXTENSIONS = DOCUMENT_EXTENSIONS.union(CODE_EXTENSIONS)

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "why",
    "with",
    "you",
}


def ensure_upload_folders() -> None:
    if object_storage_is_configured():
        return

    for folder in CATEGORY_FOLDERS.values():
        (UPLOAD_ROOT / folder).mkdir(parents=True, exist_ok=True)


def save_upload_to_library(
    db: Session,
    upload: UploadFile,
    user_id: int,
) -> tuple[FileLibrary, bool]:
    ensure_upload_folders()

    original_filename = _clean_filename(upload.filename or "uploaded-file")
    file_bytes = _read_upload(upload)

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"File is too large. Maximum upload size is {settings.MAX_UPLOAD_MB} MB."
        )

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing_file = _get_file_by_hash(db, user_id, file_hash)

    if existing_file is not None:
        return existing_file, False

    extension = Path(original_filename).suffix.lower()
    mime_type = _guess_mime_type(
        filename=original_filename,
        upload_mime_type=upload.content_type,
    )
    category = detect_category(
        extension=extension,
        mime_type=mime_type,
    )
    stored_filename = f"{file_hash}{extension}"
    if object_storage_is_configured():
        object_key = build_file_object_key(
            file_hash=file_hash,
            category=CATEGORY_FOLDERS[category],
            extension=extension,
        )
        put_file_object(
            key=object_key,
            content=file_bytes,
            content_type=mime_type,
        )
        storage_path = object_storage_reference(object_key)
    else:
        storage_path = str(
            Path("storage") / "uploads" / CATEGORY_FOLDERS[category] / stored_filename
        )
        absolute_path = BACKEND_DIR / storage_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(file_bytes)

    text = extract_text(
        file_bytes=file_bytes,
        filename=original_filename,
        category=category,
    )
    chunks = chunk_text(text) if text else []
    chunk_embeddings = _embed_document_chunks(chunks)
    scoped_hash = _scoped_file_hash(
        user_id=user_id,
        file_hash=file_hash,
    )

    library_file = FileLibrary(
        user_id=user_id,
        sha256=scoped_hash,
        sha256_hash=file_hash,
        filename=original_filename,
        original_filename=original_filename,
        extension=extension,
        stored_filename=storage_path,
        storage_path=storage_path,
        content_type=mime_type,
        mime_type=mime_type,
        byte_size=len(file_bytes),
        size=len(file_bytes),
        category=category,
        file_data=None,
        updated_at=datetime.utcnow(),
    )
    db.add(library_file)
    db.commit()
    db.refresh(library_file)

    for index, chunk in enumerate(chunks):
        db.add(
            FileChunk(
                file_id=library_file.id,
                chunk_index=index,
                content=chunk,
                embedding=(
                    chunk_embeddings[index]
                    if chunk_embeddings is not None
                    else None
                ),
            )
        )

    db.commit()

    return library_file, True


def upload_file_to_library(
    db: Session,
    upload: UploadFile,
    user_id: int,
) -> dict:
    library_file, created = save_upload_to_library(
        db=db,
        upload=upload,
        user_id=user_id,
    )

    return format_file(
        file=library_file,
        created=created,
    )


def attach_upload_to_chat(
    db: Session,
    chat_id: int,
    upload: UploadFile,
    user_id: int,
) -> dict:
    library_file, created = save_upload_to_library(
        db=db,
        upload=upload,
        user_id=user_id,
    )

    attach_files_to_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
        file_ids=[library_file.id],
    )

    return format_file(
        file=library_file,
        created=created,
    )


def attach_files_to_chat(
    db: Session,
    chat_id: int,
    user_id: int,
    file_ids: list[int],
) -> list[dict]:
    chat = _get_chat(db, chat_id, user_id)

    if chat is None:
        raise ValueError("Chat not found.")

    attached_files: list[dict] = []

    for file_id in _dedupe_ids(file_ids):
        library_file = get_library_file(
            db=db,
            file_id=file_id,
            user_id=user_id,
        )

        if library_file is None:
            raise ValueError(f"File {file_id} was not found.")

        link = _get_chat_file(
            db=db,
            chat_id=chat_id,
            file_id=file_id,
        )

        if link is None:
            db.add(
                ChatFile(
                    chat_id=chat_id,
                    file_id=file_id,
                )
            )

        attached_files.append(
            format_file(
                file=library_file,
                created=False,
            )
        )

    db.commit()

    return attached_files


def list_chat_files(
    db: Session,
    chat_id: int,
    user_id: int,
) -> list[dict]:
    chat = _get_chat(db, chat_id, user_id)

    if chat is None:
        raise ValueError("Chat not found.")

    rows = (
        db.query(ChatFile)
        .join(FileLibrary, ChatFile.file_id == FileLibrary.id)
        .filter(ChatFile.chat_id == chat_id)
        .filter(FileLibrary.user_id == user_id)
        .order_by(ChatFile.created_at.asc())
        .all()
    )

    files = []
    for row in rows:
        formatted = format_file(file=row.file, created=False)
        formatted["attached_at"] = row.created_at
        files.append(formatted)

    return files


def list_library_files(
    db: Session,
    user_id: int,
    query: str | None = None,
    category: str | None = None,
    sort: str = "newest",
) -> list[dict]:
    files_query = db.query(FileLibrary).filter(FileLibrary.user_id == user_id)

    normalized_query = (query or "").strip()
    normalized_category = (category or "").strip().lower()

    if normalized_query:
        like_query = f"%{normalized_query}%"
        files_query = files_query.filter(
            or_(
                FileLibrary.filename.ilike(like_query),
                FileLibrary.original_filename.ilike(like_query),
                FileLibrary.extension.ilike(like_query),
                FileLibrary.mime_type.ilike(like_query),
            )
        )

    if normalized_category and normalized_category != "all":
        files_query = files_query.filter(FileLibrary.category == normalized_category)

    if sort == "oldest":
        files_query = files_query.order_by(FileLibrary.created_at.asc())
    elif sort == "name":
        files_query = files_query.order_by(FileLibrary.filename.asc())
    else:
        files_query = files_query.order_by(FileLibrary.created_at.desc())

    return [
        format_file(
            file=file,
            created=False,
        )
        for file in files_query.all()
    ]


def get_library_file(
    db: Session,
    file_id: int,
    user_id: int,
) -> FileLibrary | None:
    return (
        db.query(FileLibrary)
        .filter(
            FileLibrary.id == file_id,
            FileLibrary.user_id == user_id,
        )
        .first()
    )


def rename_library_file(
    db: Session,
    file_id: int,
    user_id: int,
    filename: str,
) -> dict | None:
    library_file = get_library_file(
        db=db,
        file_id=file_id,
        user_id=user_id,
    )

    if library_file is None:
        return None

    cleaned_filename = _clean_filename(filename)

    if not Path(cleaned_filename).suffix and library_file.extension:
        cleaned_filename = f"{cleaned_filename}{library_file.extension}"

    library_file.filename = cleaned_filename
    library_file.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(library_file)

    return format_file(
        file=library_file,
        created=False,
    )


def delete_library_file(
    db: Session,
    file_id: int,
    user_id: int,
) -> bool:
    library_file = get_library_file(
        db=db,
        file_id=file_id,
        user_id=user_id,
    )

    if library_file is None:
        return False

    storage_path = library_file.storage_path or library_file.stored_filename
    file_path = get_file_path(library_file)
    file_hash = _file_hash(library_file)
    other_references = (
        db.query(FileLibrary)
        .filter(
            FileLibrary.id != library_file.id,
            or_(
                FileLibrary.sha256 == file_hash,
                FileLibrary.sha256_hash == file_hash,
            ),
        )
        .count()
    )

    db.delete(library_file)
    db.commit()

    if other_references == 0:
        if is_object_storage_reference(storage_path):
            delete_file_object(object_key_from_reference(storage_path))
        elif file_path and file_path.exists():
            file_path.unlink()

    return True


def detach_file_from_chat(
    db: Session,
    chat_id: int,
    file_id: int,
    user_id: int,
) -> bool:
    if _get_chat(db, chat_id, user_id) is None:
        return False

    if get_library_file(db=db, file_id=file_id, user_id=user_id) is None:
        return False

    link = _get_chat_file(
        db=db,
        chat_id=chat_id,
        file_id=file_id,
    )

    if link is None:
        return False

    db.delete(link)
    db.commit()

    return True


def retrieve_chat_file_context(
    db: Session,
    chat_id: int,
    user_id: int,
    question: str,
) -> list[str]:
    attached_files = _get_attached_files(
        db=db,
        chat_id=chat_id,
        user_id=user_id,
    )

    if not attached_files:
        return []

    context: list[str] = []
    used_chars = 0

    for metadata in _build_metadata_context(attached_files):
        if used_chars + len(metadata) > MAX_CONTEXT_CHARS:
            break

        context.append(metadata)
        used_chars += len(metadata)

    chunks = _retrieve_relevant_chunks(
        db=db,
        attached_files=attached_files,
        question=question,
    )

    for chunk in chunks:
        if used_chars + len(chunk) > MAX_CONTEXT_CHARS:
            break

        context.append(chunk)
        used_chars += len(chunk)

    return context


def get_chat_file_media_parts(
    db: Session,
    chat_id: int,
    user_id: int,
) -> list[dict]:
    prompt_items: list[dict] = []

    for file in _get_attached_files(db=db, chat_id=chat_id, user_id=user_id):
        category = _file_category(file)

        if category not in {"images", "audio"}:
            continue

        size = _file_size(file)

        if size > MAX_INLINE_MEDIA_BYTES:
            continue

        file_bytes = get_file_content(file)
        if file_bytes is None:
            continue

        encoded_data = base64.b64encode(file_bytes).decode("ascii")
        mime_type = _file_mime_type(file)

        prompt_items.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Attached {category[:-1]} file: {file.filename}\n"
                            "Use this file if it helps answer the user."
                        )
                    },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded_data,
                        }
                    },
                ],
            }
        )

    return prompt_items


def format_file(
    file: FileLibrary,
    created: bool,
) -> dict:
    return {
        "id": file.id,
        "filename": file.filename,
        "original_filename": file.original_filename or file.filename,
        "extension": file.extension or Path(file.filename).suffix.lower(),
        "mime_type": _file_mime_type(file),
        "content_type": _file_mime_type(file),
        "size": _file_size(file),
        "byte_size": _file_size(file),
        "sha256_hash": _file_hash(file),
        "sha256": _file_hash(file),
        "storage_path": file.storage_path or file.stored_filename,
        "category": _file_category(file),
        "chunk_count": len(file.chunks),
        "created_at": file.created_at,
        "updated_at": file.updated_at or file.created_at,
        "created": created,
    }


def get_file_path(
    file: FileLibrary,
) -> Path | None:
    storage_path = file.storage_path or file.stored_filename

    if not storage_path:
        return None

    if is_object_storage_reference(storage_path):
        return None

    path = Path(storage_path)

    if path.is_absolute():
        if path.exists():
            return path

        return _find_existing_file_path(file)

    resolved_path = BACKEND_DIR / path

    if resolved_path.exists():
        return resolved_path

    return _find_existing_file_path(file) or resolved_path


def get_file_content(file: FileLibrary) -> bytes | None:
    if file.file_data is not None:
        return bytes(file.file_data)

    storage_path = file.storage_path or file.stored_filename
    if is_object_storage_reference(storage_path):
        return get_file_object(object_key_from_reference(storage_path))

    path = get_file_path(file)
    if path is not None and path.is_file():
        return path.read_bytes()

    return None


def _find_existing_file_path(
    file: FileLibrary,
) -> Path | None:
    file_hash = _file_hash(file)
    extension = file.extension or Path(file.filename).suffix.lower()
    category = _file_category(file)
    hashed_filename = f"{file_hash}{extension}"
    storage_path = file.storage_path or file.stored_filename or ""

    candidates = [
        UPLOAD_ROOT / category / hashed_filename,
        UPLOAD_ROOT / hashed_filename,
        LEGACY_UPLOAD_ROOT / category / hashed_filename,
        LEGACY_UPLOAD_ROOT / hashed_filename,
    ]

    if storage_path:
        stored_path = Path(storage_path)
        stored_name = stored_path.name

        candidates.extend(
            [
                STORAGE_ROOT / stored_path,
                UPLOAD_ROOT / category / stored_name,
                UPLOAD_ROOT / stored_name,
                LEGACY_UPLOAD_ROOT / category / stored_name,
                LEGACY_UPLOAD_ROOT / stored_name,
            ]
        )

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def extract_text(
    file_bytes: bytes,
    filename: str,
    category: str,
) -> str | None:
    extension = Path(filename).suffix.lower()

    if category == "archive":
        return _list_archive_contents(file_bytes=file_bytes, extension=extension)

    if category not in {"documents", "code"}:
        return None

    if extension == ".pdf":
        return _extract_pdf_text(file_bytes)

    if extension == ".docx":
        return _extract_docx_text(file_bytes)

    if extension == ".pptx":
        return _extract_pptx_text(file_bytes)

    if extension == ".xlsx":
        return _extract_xlsx_text(file_bytes)

    if extension in TEXT_LIKE_EXTENSIONS or _looks_like_text(file_bytes):
        return _decode_text(file_bytes)

    return None


def chunk_text(
    text: str,
) -> list[str]:
    cleaned = _normalize_text(text)

    if not cleaned:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(cleaned):
        end = min(start + CHUNK_SIZE, len(cleaned))
        chunk = cleaned[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == len(cleaned):
            break

        start = max(0, end - CHUNK_OVERLAP)

    return chunks


def detect_category(
    extension: str,
    mime_type: str,
) -> str:
    if mime_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "images"

    if mime_type.startswith("audio/") or extension in AUDIO_EXTENSIONS:
        return "audio"

    if mime_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"

    if extension in ARCHIVE_EXTENSIONS or mime_type in {
        "application/zip",
        "application/x-7z-compressed",
        "application/vnd.rar",
        "application/x-rar-compressed",
    }:
        return "archive"

    if extension in CODE_EXTENSIONS:
        return "code"

    if (
        extension in DOCUMENT_EXTENSIONS
        or mime_type.startswith("text/")
        or "document" in mime_type
        or "presentation" in mime_type
        or "spreadsheet" in mime_type
        or "pdf" in mime_type
    ):
        return "documents"

    return "others"


def _retrieve_relevant_chunks(
    db: Session,
    attached_files: list[FileLibrary],
    question: str,
) -> list[str]:
    attached_file_ids = [
        file.id
        for file in attached_files
    ]

    if not attached_file_ids:
        return []

    if (
        db.bind is not None
        and db.bind.dialect.name == "postgresql"
        and question.strip()
    ):
        try:
            query_embedding = embed_texts(
                [question],
                task_type="RETRIEVAL_QUERY",
            )[0]
            semantic_chunks = (
                db.query(FileChunk, FileLibrary.filename)
                .join(FileLibrary, FileChunk.file_id == FileLibrary.id)
                .filter(FileChunk.file_id.in_(attached_file_ids))
                .filter(FileChunk.embedding.isnot(None))
                .order_by(FileChunk.embedding.cosine_distance(query_embedding))
                .limit(MAX_CONTEXT_CHUNKS)
                .all()
            )
            if semantic_chunks:
                return [
                    (
                        f"Source file: {filename}\n"
                        f"Chunk: {chunk.chunk_index + 1}\n\n"
                        f"{chunk.content}"
                    )
                    for chunk, filename in semantic_chunks
                ]
        except Exception as error:
            db.rollback()
            print(f"[RAG] Vector search unavailable; using keyword ranking: {error}", flush=True)

    chunks = (
        db.query(FileChunk, FileLibrary.filename)
        .join(FileLibrary, FileChunk.file_id == FileLibrary.id)
        .filter(FileChunk.file_id.in_(attached_file_ids))
        .order_by(FileChunk.file_id.asc(), FileChunk.chunk_index.asc())
        .all()
    )

    if not chunks:
        return []

    query_terms = _tokenize(question)
    scored_chunks = []

    for chunk, filename in chunks:
        scored_chunks.append(
            {
                "score": _score_chunk(
                    query_terms=query_terms,
                    chunk_text=chunk.content,
                ),
                "filename": filename,
                "chunk_index": chunk.chunk_index,
                "content": chunk.content,
            }
        )

    scored_chunks.sort(
        key=lambda item: (
            item["score"],
            -item["chunk_index"],
        ),
        reverse=True,
    )

    if all(item["score"] <= 0 for item in scored_chunks):
        selected_chunks = scored_chunks[: min(3, len(scored_chunks))]
    else:
        selected_chunks = scored_chunks[:MAX_CONTEXT_CHUNKS]

    return [
        (
            f"Source file: {item['filename']}\n"
            f"Chunk: {item['chunk_index'] + 1}\n\n"
            f"{item['content']}"
        )
        for item in selected_chunks
    ]


def _embed_document_chunks(chunks: list[str]) -> list[list[float]] | None:
    if not chunks:
        return []

    try:
        return embed_texts(chunks, task_type="RETRIEVAL_DOCUMENT")
    except Exception as error:
        print(f"[RAG] Document embedding failed; storing text chunks only: {error}", flush=True)
        return None


def _build_metadata_context(
    files: list[FileLibrary],
) -> list[str]:
    return [
        (
            "Attached file metadata\n"
            f"Name: {file.filename}\n"
            f"Type: {_file_category(file)}\n"
            f"MIME: {_file_mime_type(file)}\n"
            f"Size: {_file_size(file)} bytes\n"
            f"Extension: {file.extension or Path(file.filename).suffix.lower()}"
        )
        for file in files
    ]


def _extract_pdf_text(
    file_bytes: bytes,
) -> str | None:
    try:
        from pypdf import PdfReader
    except ImportError:
        return None

    from io import BytesIO

    reader = PdfReader(BytesIO(file_bytes))
    pages = [
        page.extract_text() or ""
        for page in reader.pages
    ]

    return "\n\n".join(pages)


def _extract_docx_text(
    file_bytes: bytes,
) -> str | None:
    return _extract_zip_xml_text(
        file_bytes=file_bytes,
        prefixes=("word/document.xml", "word/header", "word/footer"),
    )


def _extract_pptx_text(
    file_bytes: bytes,
) -> str | None:
    return _extract_zip_xml_text(
        file_bytes=file_bytes,
        prefixes=("ppt/slides/slide",),
    )


def _extract_xlsx_text(
    file_bytes: bytes,
) -> str | None:
    return _extract_zip_xml_text(
        file_bytes=file_bytes,
        prefixes=("xl/sharedStrings.xml", "xl/worksheets/sheet"),
    )


def _extract_zip_xml_text(
    file_bytes: bytes,
    prefixes: tuple[str, ...],
) -> str | None:
    from io import BytesIO

    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
            xml_parts = []

            for name in archive.namelist():
                if not name.endswith(".xml"):
                    continue

                if not any(name.startswith(prefix) for prefix in prefixes):
                    continue

                xml_parts.append(
                    _strip_xml_tags(
                        archive.read(name).decode("utf-8", errors="ignore")
                    )
                )

            return "\n\n".join(part for part in xml_parts if part.strip()) or None
    except zipfile.BadZipFile:
        return None


def _list_archive_contents(
    file_bytes: bytes,
    extension: str,
) -> str | None:
    if extension != ".zip":
        return None

    from io import BytesIO

    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
            names = archive.namelist()[:200]
            return "Archive contents:\n" + "\n".join(names)
    except zipfile.BadZipFile:
        return None


def _strip_xml_tags(
    xml_text: str,
) -> str:
    text = re.sub(r"<[^>]+>", " ", xml_text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def _score_chunk(
    query_terms: set[str],
    chunk_text: str,
) -> float:
    if not query_terms:
        return 0

    chunk_terms = _tokenize(chunk_text)

    if not chunk_terms:
        return 0

    overlap = query_terms.intersection(chunk_terms)
    coverage = len(overlap) / max(len(query_terms), 1)
    density = sum(chunk_text.lower().count(term) for term in overlap)

    return coverage + math.log1p(density)


def _tokenize(
    text: str,
) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9]{3,}", text.lower())
        if token not in STOP_WORDS
    }


def _normalize_text(
    text: str,
) -> str:
    cleaned = text.replace("\x00", " ")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    return cleaned.strip()


def _looks_like_text(
    file_bytes: bytes,
) -> bool:
    sample = file_bytes[:2048]

    if not sample:
        return False

    return b"\x00" not in sample


def _decode_text(
    file_bytes: bytes,
) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue

    return file_bytes.decode("utf-8", errors="ignore")


def _guess_mime_type(
    filename: str,
    upload_mime_type: str | None,
) -> str:
    guessed_type = mimetypes.guess_type(filename)[0]

    return upload_mime_type or guessed_type or "application/octet-stream"


def _read_upload(
    upload: UploadFile,
) -> bytes:
    return upload.file.read()


def _clean_filename(
    filename: str,
) -> str:
    cleaned = Path(filename).name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", cleaned)

    return cleaned or "uploaded-file"


def _dedupe_ids(
    ids: list[int],
) -> list[int]:
    seen: set[int] = set()
    deduped: list[int] = []

    for item_id in ids:
        if item_id in seen:
            continue

        seen.add(item_id)
        deduped.append(item_id)

    return deduped


def _get_attached_files(
    db: Session,
    chat_id: int,
    user_id: int,
) -> list[FileLibrary]:
    rows = (
        db.query(ChatFile)
        .join(FileLibrary, ChatFile.file_id == FileLibrary.id)
        .filter(ChatFile.chat_id == chat_id)
        .filter(FileLibrary.user_id == user_id)
        .order_by(ChatFile.created_at.asc())
        .all()
    )

    return [
        row.file
        for row in rows
    ]


def _get_chat(
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


def _get_file_by_hash(
    db: Session,
    user_id: int,
    file_hash: str,
) -> FileLibrary | None:
    return (
        db.query(FileLibrary)
        .filter(FileLibrary.user_id == user_id)
        .filter(
            or_(
                FileLibrary.sha256 == file_hash,
                FileLibrary.sha256_hash == file_hash,
            )
        )
        .first()
    )


def _get_chat_file(
    db: Session,
    chat_id: int,
    file_id: int,
) -> ChatFile | None:
    return (
        db.query(ChatFile)
        .filter(
            ChatFile.chat_id == chat_id,
            ChatFile.file_id == file_id,
        )
        .first()
    )


def _scoped_file_hash(
    user_id: int,
    file_hash: str,
) -> str:
    return hashlib.sha256(f"{user_id}:{file_hash}".encode("utf-8")).hexdigest()


def _file_hash(
    file: FileLibrary,
) -> str:
    return file.sha256_hash or file.sha256


def _file_mime_type(
    file: FileLibrary,
) -> str:
    return file.mime_type or file.content_type or "application/octet-stream"


def _file_size(
    file: FileLibrary,
) -> int:
    return file.size or file.byte_size or 0


def _file_category(
    file: FileLibrary,
) -> str:
    if file.category:
        return file.category

    return detect_category(
        extension=file.extension or Path(file.filename).suffix.lower(),
        mime_type=_file_mime_type(file),
    )
