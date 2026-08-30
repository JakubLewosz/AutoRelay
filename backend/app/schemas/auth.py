from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.common import APIModel


class UserResponse(APIModel):
    id: UUID
    email: EmailStr
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class RegisterRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(APIModel):
    user: UserResponse
    csrf_token: str = Field(min_length=32)
