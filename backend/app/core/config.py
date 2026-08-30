from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def repository_environment_file() -> Path | None:
    """Return the repository-local dotenv path without consulting the process CWD."""

    backend_root = Path(__file__).resolve().parents[2]
    repository_root = backend_root.parent
    if not (
        (backend_root / "pyproject.toml").is_file()
        and (repository_root / "docker-compose.yml").is_file()
    ):
        return None
    return repository_root / ".env"


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    environment: Literal["development", "test", "production"] = Field(
        default="development",
        validation_alias=AliasChoices("environment", "APP_ENV", "ENVIRONMENT"),
    )
    database_url: str
    fernet_key: SecretStr
    session_cookie_secure: bool = False
    session_cookie_name: str = "autorelay_session"
    csrf_cookie_name: str = "autorelay_csrf"
    session_ttl_hours: int = Field(default=168, ge=1, le=24 * 90)
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:8080"]
    )
    public_base_url: str = "http://localhost:8080"
    allow_private_action_targets: bool = False
    webhook_max_payload_bytes: int = Field(default=65_536, ge=1024, le=1_048_576)
    action_timeout_seconds: float = Field(default=10.0, ge=1.0, le=30.0)
    worker_poll_interval_seconds: float = Field(default=1.0, ge=0.1, le=60.0)
    worker_concurrency: int = Field(default=4, ge=1, le=32)
    worker_max_attempts: int = Field(default=3, ge=1, le=10)
    worker_stale_after_seconds: int = Field(default=300, ge=60, le=86_400)
    worker_retry_base_seconds: int = Field(default=2, ge=1, le=300)
    worker_retry_max_seconds: int = Field(default=60, ge=1, le=3600)
    log_level: str = "INFO"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for origin in value:
            parsed = urlsplit(origin)
            try:
                _ = parsed.port
            except ValueError as exc:
                raise ValueError("CORS_ORIGINS must contain explicit HTTP(S) origins") from exc
            if (
                origin == "*"
                or parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("CORS_ORIGINS must contain explicit HTTP(S) origins")
            normalized.append(origin.rstrip("/"))
        return normalized

    @field_validator("database_url")
    @classmethod
    def require_async_database_driver(cls, value: str) -> str:
        if not value.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
            raise ValueError("DATABASE_URL must use asyncpg (or aiosqlite for tests)")
        return value

    @field_validator("public_base_url")
    @classmethod
    def normalize_public_base_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        try:
            _ = parsed.port
        except ValueError as exc:
            raise ValueError("PUBLIC_BASE_URL must be an explicit HTTP(S) origin") from exc
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("PUBLIC_BASE_URL must be an explicit HTTP(S) origin")
        return value.rstrip("/")

    @model_validator(mode="after")
    def prevent_private_targets_in_production(self) -> Settings:
        if self.environment != "test" and self.database_url.startswith("sqlite+aiosqlite://"):
            raise ValueError("SQLite is supported only when APP_ENV=test; PostgreSQL is required")
        if self.environment == "production" and self.allow_private_action_targets:
            raise ValueError("private action targets cannot be enabled in production")
        if self.environment == "production" and not self.session_cookie_secure:
            raise ValueError("SESSION_COOKIE_SECURE must be enabled in production")
        if self.environment == "production" and not self.public_base_url.startswith("https://"):
            raise ValueError("PUBLIC_BASE_URL must use HTTPS in production")
        try:
            Fernet(self.fernet_key.get_secret_value().encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise ValueError("FERNET_KEY must be a valid Fernet key") from exc
        return self


@lru_cache
def load_settings() -> Settings:
    return Settings(_env_file=repository_environment_file())
