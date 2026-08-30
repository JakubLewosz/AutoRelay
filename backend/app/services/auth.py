from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import (
    hash_password,
    hash_secret,
    new_secret,
    normalize_email,
    password_needs_rehash,
    verify_password,
)
from app.db.base import utc_now
from app.models.session import UserSession
from app.models.user import User


@dataclass(frozen=True, slots=True)
class NewAuthentication:
    user: User
    session_token: str
    csrf_token: str
    expires_at_seconds: int


async def _new_session(user: User, session: AsyncSession, settings: Settings) -> NewAuthentication:
    session_token = new_secret()
    csrf_token = new_secret()
    ttl = timedelta(hours=settings.session_ttl_hours)
    now = utc_now()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_secret(session_token),
            csrf_token_hash=hash_secret(csrf_token),
            created_at=now,
            expires_at=now + ttl,
            last_used_at=now,
        )
    )
    return NewAuthentication(user, session_token, csrf_token, int(ttl.total_seconds()))


async def register_user(
    email: str, password: str, session: AsyncSession, settings: Settings
) -> NewAuthentication:
    normalized_email = normalize_email(email)
    existing = await session.scalar(select(User.id).where(User.email == normalized_email))
    if existing is not None:
        raise AppError(409, "email_in_use", "An account with this email already exists.")
    now = utc_now()
    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        is_active=True,
        last_login_at=now,
    )
    session.add(user)
    try:
        await session.flush()
        authentication = await _new_session(user, session, settings)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(409, "email_in_use", "An account with this email already exists.") from exc
    return authentication


async def login_user(
    email: str, password: str, session: AsyncSession, settings: Settings
) -> NewAuthentication:
    normalized_email = normalize_email(email)
    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None or not verify_password(user.password_hash, password) or not user.is_active:
        raise AppError(
            401,
            "invalid_credentials",
            "The email or password is incorrect.",
            headers={"WWW-Authenticate": "Session"},
        )
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = utc_now()
    authentication = await _new_session(user, session, settings)
    await session.commit()
    return authentication


async def logout_session(session_record: UserSession, session: AsyncSession) -> None:
    await session.delete(session_record)
    await session.commit()


async def purge_expired_sessions(session: AsyncSession) -> int:
    result = await session.execute(delete(UserSession).where(UserSession.expires_at <= utc_now()))
    await session.commit()
    return int(result.rowcount or 0)
