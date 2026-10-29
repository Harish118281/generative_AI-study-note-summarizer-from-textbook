import hashlib

from app.core.database import SessionLocal
from app.models.file_library import FileLibrary
from app.services.file_rag_service import get_file_path
from app.services.object_storage import (
    build_file_object_key,
    object_storage_is_configured,
    object_storage_reference,
    put_file_object,
    is_object_storage_reference,
)


def main() -> None:
    if not object_storage_is_configured():
        raise RuntimeError("Neon Object Storage credentials are missing from Backend/.env")

    db = SessionLocal()
    migrated = 0
    already_remote = 0
    missing = 0

    try:
        files = db.query(FileLibrary).order_by(FileLibrary.id.asc()).all()
        for file in files:
            current_path = file.storage_path or file.stored_filename
            if is_object_storage_reference(current_path):
                already_remote += 1
                continue

            local_path = get_file_path(file)
            if local_path is not None and local_path.is_file():
                content = local_path.read_bytes()
            elif file.file_data is not None:
                content = bytes(file.file_data)
            else:
                missing += 1
                print(f"Missing local content for library record {file.id}")
                continue

            actual_hash = hashlib.sha256(content).hexdigest()
            expected_hash = file.sha256_hash
            if expected_hash and expected_hash != actual_hash:
                raise ValueError(
                    f"File hash mismatch for library record {file.id}; migration stopped."
                )

            extension = file.extension or ""
            category = file.category or "others"
            key = build_file_object_key(
                file_hash=actual_hash,
                category=category,
                extension=extension,
            )
            put_file_object(
                key=key,
                content=content,
                content_type=file.mime_type or file.content_type or "application/octet-stream",
            )

            remote_reference = object_storage_reference(key)
            file.storage_path = remote_reference
            file.stored_filename = remote_reference
            file.sha256_hash = actual_hash
            file.size = len(content)
            file.byte_size = len(content)
            db.commit()
            migrated += 1
            print(f"Migrated library record {file.id} ({len(content)} bytes)")

        print(
            f"Migration finished: {migrated} uploaded, "
            f"{already_remote} already remote, {missing} missing."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
