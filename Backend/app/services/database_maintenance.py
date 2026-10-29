from sqlalchemy import inspect, text

from app.core.database import engine


def ensure_database_shape() -> None:
    """
    Keep simple create_all-based development databases compatible after model edits.
    """

    inspector = inspect(engine)

    with engine.begin() as connection:
        if inspector.has_table("file_library"):
            _add_missing_columns(connection, "file_library", _file_library_columns())

        if inspector.has_table("chats"):
            _add_missing_columns(connection, "chats", {"user_id": "INTEGER"})

        if engine.dialect.name == "postgresql" and inspector.has_table("file_chunks"):
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            connection.execute(
                text("ALTER TABLE file_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)")
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_file_chunks_embedding_hnsw "
                    "ON file_chunks USING hnsw (embedding vector_cosine_ops)"
                )
            )


def _add_missing_columns(connection, table_name: str, expected_columns: dict[str, str]) -> None:
    columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
    for column_name, column_type in expected_columns.items():
        if column_name not in columns:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def _file_library_columns() -> dict[str, str]:
    binary_type = "BYTEA"

    if engine.dialect.name != "postgresql":
        binary_type = "BLOB"

    return {
        "file_data": binary_type,
        "original_filename": "VARCHAR(255)",
        "extension": "VARCHAR(32)",
        "mime_type": "VARCHAR(255)",
        "size": "INTEGER",
        "sha256_hash": "VARCHAR(64)",
        "storage_path": "TEXT",
        "category": "VARCHAR(32)",
        "updated_at": "TIMESTAMP",
        "user_id": "INTEGER",
    }
