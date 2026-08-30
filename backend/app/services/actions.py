from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx

from app.core.config import Settings
from app.models.enums import ActionType
from app.services.conditions import resolve_dot_path
from app.services.network import validate_discord_webhook_url, validate_outbound_url

_TEMPLATE_VARIABLE = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*}}")
_MAX_RESPONSE_BYTES = 65_536


@dataclass(frozen=True, slots=True)
class ActionResult:
    succeeded: bool
    retryable: bool
    safe_result: dict[str, Any]
    error_code: str | None = None
    error_message: str | None = None


def render_discord_template(template: str, payload: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        value = resolve_dot_path(payload, match.group(1))
        if value.__class__ is object:
            return ""
        if value is None:
            return "null"
        if isinstance(value, str):
            return value
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, int | float):
            return str(value)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    rendered = _TEMPLATE_VARIABLE.sub(replace, template)
    return rendered[:2000]


async def execute_action(
    action_type: ActionType | str,
    config: dict[str, Any],
    payload: dict[str, Any],
    execution_id: UUID,
    settings: Settings,
    *,
    client: httpx.AsyncClient | None = None,
) -> ActionResult:
    timeout = min(float(config.get("timeout_seconds") or settings.action_timeout_seconds), 30.0)
    try:
        async with asyncio.timeout(timeout):
            return await _execute_action_once(
                action_type, config, payload, execution_id, settings, timeout, client
            )
    except (TimeoutError, httpx.TimeoutException):
        return ActionResult(
            False,
            True,
            {"outcome": "timeout"},
            "action_timeout",
            "The action target did not respond before the timeout.",
        )
    except httpx.RequestError:
        return ActionResult(
            False,
            True,
            {"outcome": "network_error"},
            "action_network_error",
            "The action target could not be reached.",
        )


async def _execute_action_once(
    action_type: ActionType | str,
    config: dict[str, Any],
    payload: dict[str, Any],
    execution_id: UUID,
    settings: Settings,
    request_timeout_seconds: float,
    client: httpx.AsyncClient | None,
) -> ActionResult:
    selected_type = ActionType(action_type)
    if selected_type is ActionType.HTTP_POST:
        target_url = await validate_outbound_url(
            str(config["target_url"]), allow_private=settings.allow_private_action_targets
        )
        request_json: dict[str, Any] = payload
        headers = {str(key): str(value) for key, value in dict(config.get("headers", {})).items()}
    else:
        target_url = validate_discord_webhook_url(str(config["webhook_url"]))
        request_json = {
            "content": render_discord_template(str(config["message_template"]), payload)
        }
        headers = {}
    headers["X-AutoRelay-Execution-ID"] = str(execution_id)

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(
            follow_redirects=False, timeout=request_timeout_seconds, trust_env=False
        )
    try:
        async with client.stream(
            "POST",
            target_url,
            json=request_json,
            headers=headers,
            timeout=request_timeout_seconds,
            follow_redirects=False,
        ) as response:
            status_code = response.status_code
            response_bytes = 0
            response_truncated = False
            async for chunk in response.aiter_bytes():
                remaining = _MAX_RESPONSE_BYTES - response_bytes
                if len(chunk) > remaining:
                    response_bytes = _MAX_RESPONSE_BYTES
                    response_truncated = True
                    break
                response_bytes += len(chunk)
    finally:
        if owns_client:
            await client.aclose()

    safe_result = {
        "outcome": "http_response",
        "status_code": status_code,
        "response_bytes": response_bytes,
        "response_truncated": response_truncated,
    }
    if 200 <= status_code < 300:
        return ActionResult(True, False, safe_result)
    retryable = status_code == 429 or status_code >= 500
    return ActionResult(
        False,
        retryable,
        safe_result,
        "action_http_error",
        f"The action target returned HTTP {status_code}.",
    )
