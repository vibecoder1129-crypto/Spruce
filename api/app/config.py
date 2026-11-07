from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from SPRUCE_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="SPRUCE_", env_file=".env", extra="ignore")

    env: Literal["dev", "test", "staging", "prod"] = "dev"
    # The product name lives here and in web/src/brand.ts only, so a rename is one change each.
    brand_name: str = "Spruce"
    app_base_url: str = "http://localhost:3000"

    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+psycopg://spruce:spruce@127.0.0.1:5432/spruce")
    )
    redis_url: RedisDsn = Field(default=RedisDsn("redis://127.0.0.1:6379/0"))
    # Origins allowed to call the API from a browser. Never "*": cookies carry the session.
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"

    # 32-byte keys, base64. Required: there is deliberately no default.
    data_key: SecretStr  # AES-256-GCM for personal data at rest
    index_key: SecretStr  # HMAC-SHA256 blind index for email lookup

    access_ttl_seconds: int = 10 * 60
    session_ttl_seconds: int = 30 * 24 * 3600
    cookie_secure: bool = True

    email_backend: Literal["console", "memory", "brevo"] = "console"
    email_from: str = "no-reply@spruce.local"
    brevo_api_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
