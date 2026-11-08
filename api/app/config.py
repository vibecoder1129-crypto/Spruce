from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from SPRUCE_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="SPRUCE_", env_file=".env", extra="ignore")

    env: Literal["dev", "test", "staging", "prod"] = "dev"
    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+psycopg://spruce:spruce@127.0.0.1:5432/spruce")
    )
    redis_url: RedisDsn = Field(default=RedisDsn("redis://127.0.0.1:6379/0"))
    # Origins allowed to call the API from a browser. Never "*": cookies carry the session.
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
