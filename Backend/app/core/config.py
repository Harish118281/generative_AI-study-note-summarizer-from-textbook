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
    TAVILY_API_KEY: str | None = None
    HF_TOKEN: str | None = None
    JWT_SECRET_KEY: str = "change-this-development-secret-before-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    MAX_UPLOAD_MB: int = 200

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
