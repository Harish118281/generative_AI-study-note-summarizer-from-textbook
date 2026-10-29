from sqlalchemy import select
from time import sleep
from google.genai import errors

from app.core.database import SessionLocal, engine
from app.models.file_library import FileChunk
from app.services.embedding_service import embed_texts


BATCH_SIZE = 32
PAUSE_SECONDS = 65


def main() -> None:
    engine.echo = False
    db = SessionLocal()
    updated = 0

    try:
        while True:
            rows = db.scalars(
                select(FileChunk)
                .where(FileChunk.embedding.is_(None))
                .order_by(FileChunk.id)
                .limit(BATCH_SIZE)
            ).all()
            if not rows:
                break

            while True:
                try:
                    vectors = embed_texts(
                        [row.content for row in rows],
                        task_type="RETRIEVAL_DOCUMENT",
                    )
                    break
                except errors.APIError as error:
                    if error.code != 429:
                        raise
                    print(
                        f"Embedding quota reached; waiting {PAUSE_SECONDS}s before retry.",
                        flush=True,
                    )
                    sleep(PAUSE_SECONDS)
            for row, vector in zip(rows, vectors, strict=True):
                row.embedding = vector

            db.commit()
            updated += len(rows)
            print(f"Embedded {updated} chunks", flush=True)
            if len(rows) == BATCH_SIZE:
                db.close()
                sleep(PAUSE_SECONDS)
                db = SessionLocal()

        print(f"Backfill complete: {updated} chunks embedded.", flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
