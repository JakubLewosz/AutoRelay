from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.dependencies import AppSettings, CSRFProtectedAuth, CurrentAuth, DBSession
from app.core.security import hash_secret, new_secret, secrets_match
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.auth import NewAuthentication, login_user, logout_session, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(
    response: Response,
    authentication: NewAuthentication,
    settings: AppSettings,
) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        authentication.session_token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api",
        max_age=authentication.expires_at_seconds,
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        authentication.csrf_token,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api",
        max_age=authentication.expires_at_seconds,
    )


def _auth_response(authentication: NewAuthentication) -> AuthResponse:
    return AuthResponse(
        user=UserResponse.model_validate(authentication.user),
        csrf_token=authentication.csrf_token,
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
async def register(
    data: RegisterRequest, response: Response, session: DBSession, settings: AppSettings
) -> AuthResponse:
    authentication = await register_user(data.email, data.password, session, settings)
    _set_auth_cookies(response, authentication, settings)
    return _auth_response(authentication)


@router.post("/login", response_model=AuthResponse, summary="Log in")
async def login(
    data: LoginRequest, response: Response, session: DBSession, settings: AppSettings
) -> AuthResponse:
    authentication = await login_user(data.email, data.password, session, settings)
    _set_auth_cookies(response, authentication, settings)
    return _auth_response(authentication)


@router.get("/me", response_model=AuthResponse, summary="Get the current account")
async def me(
    auth: CurrentAuth,
    response: Response,
    session: DBSession,
    settings: AppSettings,
) -> AuthResponse:
    csrf_token = auth.csrf_cookie
    if not csrf_token or not secrets_match(csrf_token, auth.session_record.csrf_token_hash):
        csrf_token = new_secret()
        auth.session_record.csrf_token_hash = hash_secret(csrf_token)
        await session.commit()
        response.set_cookie(
            settings.csrf_cookie_name,
            csrf_token,
            httponly=False,
            secure=settings.session_cookie_secure,
            samesite="lax",
            path="/api",
            max_age=settings.session_ttl_hours * 3600,
        )
    return AuthResponse(user=UserResponse.model_validate(auth.user), csrf_token=csrf_token)


@router.post(
    "/logout",
    response_model=None,
    response_class=Response,
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Log out",
)
async def logout(
    auth: CSRFProtectedAuth,
    response: Response,
    session: DBSession,
    settings: AppSettings,
) -> Response:
    await logout_session(auth.session_record, session)
    response.delete_cookie(settings.session_cookie_name, path="/api")
    response.delete_cookie(settings.csrf_cookie_name, path="/api")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
