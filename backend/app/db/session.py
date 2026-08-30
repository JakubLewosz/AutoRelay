from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.config import Settings

SessionFactory = async_sessionmaker[AsyncSession]


def create_engine_and_session_factory(settings: Settings) -> tuple[AsyncEngine, SessionFactory]:
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if settings.database_url.startswith("sqlite+aiosqlite:///:memory:"):
        kwargs.update({"poolclass": StaticPool, "connect_args": {"check_same_thread": False}})
    engine = create_async_engine(settings.database_url, **kwargs)
    return engine, async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    factory: SessionFactory = request.app.state.session_factory
    async with factory() as session:
        yield session
