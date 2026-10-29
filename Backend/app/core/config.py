from pathlib import Path

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    DATABASE_URL: str
    GEMINI_API_KEY: str
    NVIDIA_API_KEY: str | None = None
    CLOUDFLARE_API_KEY: str | None = None
    CLOUDFLARE_ACCOUNT_ID: str | None = None
    CLOUDFLARE_TITLE_MODEL: str = "@cf/meta/llama-3.2-1b-instruct"
    TAVILY_API_KEY: str | None = None
    AWS_ENDPOINT_URL_S3: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_REGION: str | None = None
    NEON_STORAGE_BUCKET: str = "uploads"
    JWT_SECRET_KEY: str = "change-this-development-secret-before-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    MAX_UPLOAD_MB: int = 200
    FRONTEND_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            dotenv_settings,
            env_settings,
            file_secret_settings,
        )


settings = Settings()
