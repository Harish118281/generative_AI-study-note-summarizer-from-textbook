from functools import lru_cache

import boto3
from botocore.config import Config

from app.core.config import settings


OBJECT_STORAGE_PREFIX = "neon://"


def object_storage_is_configured() -> bool:
    return all(
        (
            settings.AWS_ENDPOINT_URL_S3,
            settings.AWS_ACCESS_KEY_ID,
            settings.AWS_SECRET_ACCESS_KEY,
        )
    )


def build_file_object_key(
    file_hash: str,
    category: str,
    extension: str,
) -> str:
    return f"{category}/{file_hash}{extension.lower()}"


def object_storage_reference(key: str) -> str:
    return f"{OBJECT_STORAGE_PREFIX}{key}"


def is_object_storage_reference(value: str | None) -> bool:
    return bool(value and value.startswith(OBJECT_STORAGE_PREFIX))


def object_key_from_reference(value: str) -> str:
    if not is_object_storage_reference(value):
        raise ValueError("Not a Neon object storage reference")

    return value[len(OBJECT_STORAGE_PREFIX):]


def put_file_object(
    key: str,
    content: bytes,
    content_type: str,
) -> None:
    _client().put_object(
        Bucket=settings.NEON_STORAGE_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
    )


def get_file_object(key: str) -> bytes:
    response = _client().get_object(
        Bucket=settings.NEON_STORAGE_BUCKET,
        Key=key,
    )
    return response["Body"].read()


def delete_file_object(key: str) -> None:
    _client().delete_object(
        Bucket=settings.NEON_STORAGE_BUCKET,
        Key=key,
    )


@lru_cache(maxsize=1)
def _client():
    if not object_storage_is_configured():
        raise RuntimeError("Neon Object Storage credentials are not configured")

    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_ENDPOINT_URL_S3,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION or "us-east-1",
        config=Config(s3={"addressing_style": "path"}),
    )
