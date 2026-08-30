from __future__ import annotations

import os
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode("ascii"))
os.environ.setdefault("APP_ENV", "test")

from app.core.config import Settings
from app.db.base import Base
from app.db.session import SessionFactory, create_engine_and_session_factory
from app.main import create_app


@dataclass(slots=True)
class BackendTestContext:
    app: object
    engine: AsyncEngine
    factory: SessionFactory
    settings: Settings

    def transport(self) -> httpx.ASGITransport:
        return httpx.ASGITransport(app=self.app)  # type: ignore[arg-type]


def validate_destructive_test_database_url(database_url: str) -> None:
    parsed = make_url(database_url)
    backend = parsed.get_backend_name()
    if backend == "sqlite":
        if database_url != "sqlite+aiosqlite:///:memory:":
            raise RuntimeError("SQLite tests must use the in-memory database")
        return
    if backend == "postgresql":
        database_name = parsed.database or ""
        if database_name.endswith("_test") or database_name.startswith("test_"):
            return
        raise RuntimeError("TEST_DATABASE_URL must name an unmistakable test database")
    raise RuntimeError(
        "TEST_DATABASE_URL must use in-memory SQLite or a dedicated PostgreSQL test DB"
    )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def context() -> AsyncIterator[BackendTestContext]:
    database_url = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    validate_destructive_test_database_url(database_url)
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        fernet_key=Fernet.generate_key().decode("ascii"),
        public_base_url="http://testserver",
        cors_origins=["http://testserver"],
        webhook_max_payload_bytes=1024,
        worker_retry_base_seconds=1,
        worker_retry_max_seconds=2,
    )
    engine, factory = create_engine_and_session_factory(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    app = create_app(settings, session_factory=factory)
    async with app.router.lifespan_context(app):  # type: ignore[union-attr]
        yield BackendTestContext(app, engine, factory, settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(context: BackendTestContext) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=context.transport(), base_url="http://testserver"
    ) as test_client:
        yield test_client


async def register(
    client: httpx.AsyncClient,
    *,
    email: str = "owner@example.com",
    password: str = "correct horse battery staple",
) -> str:
    response = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    return str(response.json()["csrf_token"])


def discord_workflow_payload(
    *, name: str = "High-value lead", enabled: bool = True, condition: bool = True
) -> dict[str, object]:
    body: dict[str, object] = {
        "name": name,
        "description": "Notify the sales channel.",
        "is_enabled": enabled,
        "action": {
            "action_type": "DISCORD_WEBHOOK",
            "config": {
                "webhook_url": "https://discord.com/api/webhooks/123456/very-secret-token",
                "message_template": "Lead {{ lead.name }} is worth {{ lead.value }}",
            },
        },
    }
    if condition:
        body["condition"] = {
            "field_path": "lead.value",
            "operator": "greater_than_or_equal",
            "comparison_value": 1000,
        }
    return body
