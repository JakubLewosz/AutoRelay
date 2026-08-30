from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api import auth, executions, health, hooks, workflows
from app.core.config import Settings, load_settings
from app.core.errors import AppError
from app.db.session import SessionFactory, create_engine_and_session_factory

logger = logging.getLogger("autorelay.api")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


def _error_body(
    request: Request, code: str, message: str, details: object | None = None
) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(request.state, "request_id", "unknown"),
        }
    }


def create_app(
    settings: Settings | None = None,
    *,
    session_factory: SessionFactory | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings()
    managed_engine: AsyncEngine | None = None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        nonlocal managed_engine
        if session_factory is None:
            managed_engine, factory = create_engine_and_session_factory(resolved_settings)
            app.state.session_factory = factory
        else:
            app.state.session_factory = session_factory
        try:
            yield
        finally:
            if managed_engine is not None:
                await managed_engine.dispose()

    application = FastAPI(
        title="AutoRelay API",
        version="0.1.0",
        description="Webhook-driven workflows with durable execution history.",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-CSRF-Token", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @application.middleware("http")
    async def request_id_middleware(request: Request, call_next: object) -> object:
        incoming = request.headers.get("X-Request-ID", "")
        request.state.request_id = incoming if _REQUEST_ID.fullmatch(incoming) else str(uuid4())
        response = await call_next(request)  # type: ignore[operator]
        response.headers["X-Request-ID"] = request.state.request_id
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, exc.code, exc.message, exc.details),
            headers=exc.headers,
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            {
                "location": [str(part) for part in error.get("loc", ())],
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type", "validation_error"),
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=_error_body(request, "validation_error", "Request validation failed.", details),
        )

    @application.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
        message = (
            exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, "http_error", message),
            headers=exc.headers,
        )

    @application.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, _exc: Exception) -> JSONResponse:
        logger.error("Unhandled API error (request_id=%s)", request.state.request_id)
        return JSONResponse(
            status_code=500,
            content=_error_body(request, "internal_error", "An unexpected error occurred."),
        )

    application.include_router(health.router, prefix="/api")
    application.include_router(auth.router, prefix="/api/v1")
    application.include_router(workflows.router, prefix="/api/v1")
    application.include_router(executions.router, prefix="/api/v1")
    application.include_router(hooks.router, prefix="/api/v1")
    return application


app = create_app()
