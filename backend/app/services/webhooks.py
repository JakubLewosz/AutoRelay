from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.errors import AppError
from app.core.json_values import (
    parse_finite_json_float,
    reject_json_constant,
    validate_jsonb_value,
)
from app.core.security import secrets_match
from app.models.workflow import Workflow


async def read_json_object(request: Request, max_bytes: int) -> dict[str, Any]:
    content_type = (
        request.headers.get("content-type", "").split(";", maxsplit=1)[0].strip().casefold()
    )
    if content_type != "application/json":
        raise AppError(415, "json_required", "Webhook requests must use application/json.")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise AppError(413, "payload_too_large", "The webhook payload is too large.")
        except ValueError as exc:
            raise AppError(
                400, "invalid_content_length", "The Content-Length header is invalid."
            ) from exc
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > max_bytes:
            raise AppError(413, "payload_too_large", "The webhook payload is too large.")
        chunks.append(chunk)
    try:
        payload = json.loads(
            b"".join(chunks),
            parse_constant=reject_json_constant,
            parse_float=parse_finite_json_float,
        )
        validate_jsonb_value(payload)
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise AppError(400, "invalid_json", "The webhook body is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise AppError(422, "json_object_required", "The webhook payload must be a JSON object.")
    return payload


async def authenticate_webhook(
    workflow_id: UUID, raw_token: str, session: AsyncSession
) -> Workflow:
    workflow = await session.scalar(
        select(Workflow)
        .options(selectinload(Workflow.condition), selectinload(Workflow.action))
        .where(Workflow.id == workflow_id)
        .with_for_update()
    )
    if workflow is None or not secrets_match(raw_token, workflow.webhook_token_hash):
        raise AppError(404, "webhook_not_found", "The webhook endpoint was not found.")
    if not workflow.is_enabled:
        raise AppError(409, "workflow_disabled", "This workflow is disabled.")
    return workflow


def ensure_test_payload_size(payload: dict[str, Any], settings: Settings) -> None:
    try:
        validate_jsonb_value(payload)
        serialized = json.dumps(
            payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise AppError(
            422, "invalid_json", "The test payload must contain standard JSON values."
        ) from exc
    if len(serialized) > settings.webhook_max_payload_bytes:
        raise AppError(413, "payload_too_large", "The test payload is too large.")
