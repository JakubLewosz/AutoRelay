from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import hash_secret, secrets_match
from app.db.base import utc_now
from app.db.session import get_db
from app.models.session import UserSession
from app.models.user import User

DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


AppSettings = Annotated[Settings, Depends(get_settings)]


@dataclass(slots=True)
class AuthContext:
    user: User
    session_record: UserSession
    csrf_cookie: str | None


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def get_auth_context(
    request: Request,
    settings: AppSettings,
    session: DBSession,
) -> AuthContext:
    raw_session = request.cookies.get(settings.session_cookie_name)
    raw_csrf = request.cookies.get(settings.csrf_cookie_name)
    if not raw_session:
        raise AppError(401, "authentication_required", "Authentication is required.")
    record = await session.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(UserSession.token_hash == hash_secret(raw_session))
    )
    if record is None:
        raise AppError(401, "invalid_session", "The session is invalid or has expired.")
    if _as_aware(record.expires_at) <= utc_now():
        await session.delete(record)
        await session.commit()
        raise AppError(401, "invalid_session", "The session is invalid or has expired.")
    if not record.user.is_active:
        raise AppError(403, "account_disabled", "This account is disabled.")
    record.last_used_at = utc_now()
    await session.commit()
    return AuthContext(record.user, record, raw_csrf)


CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]


async def require_csrf(
    auth: CurrentAuth,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthContext:
    if (
        not csrf_header
        or not auth.csrf_cookie
        or not secrets_match(csrf_header, auth.session_record.csrf_token_hash)
        or not secrets_match(auth.csrf_cookie, auth.session_record.csrf_token_hash)
        or csrf_header != auth.csrf_cookie
    ):
        raise AppError(403, "csrf_validation_failed", "The CSRF token is missing or invalid.")
    return auth


CSRFProtectedAuth = Annotated[AuthContext, Depends(require_csrf)]
