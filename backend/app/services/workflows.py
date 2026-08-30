from __future__ import annotations

from math import ceil
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.core.json_values import InvalidJSONValue, validate_jsonb_value
from app.core.security import SecretBox, hash_secret, new_secret
from app.models.enums import ActionType, ConditionOperator
from app.models.user import User
from app.models.workflow import Workflow, WorkflowAction, WorkflowCondition
from app.schemas.common import Paginated
from app.schemas.workflow import (
    ActionInput,
    ActionResponse,
    ActionSummary,
    ConditionResponse,
    DiscordActionInput,
    HTTPActionInput,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowSummary,
    WorkflowUpdate,
)
from app.services.network import validate_discord_webhook_url, validate_outbound_url


def _secret_box(settings: Settings) -> SecretBox:
    return SecretBox(settings.fernet_key.get_secret_value())


def _redact_url(url: str) -> str:
    parsed = urlsplit(url)
    # Paths and query strings frequently carry webhook/API tokens. Owner-facing
    # responses reveal only the origin and an explicit placeholder.
    return urlunsplit((parsed.scheme, parsed.netloc, "/••••••", "", ""))


def _validated_action_configs(
    config: dict[str, Any], safe_config: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        validate_jsonb_value(config)
        validate_jsonb_value(safe_config)
    except InvalidJSONValue as exc:
        raise AppError(422, "invalid_action_config", str(exc)) from exc
    return config, safe_config


async def _prepare_action_config(
    action: ActionInput,
    settings: Settings,
    current_type: ActionType | None = None,
    current_config: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    preserve = current_config if current_type is action.action_type else None
    if isinstance(action, HTTPActionInput):
        old_target_url = str((preserve or {}).get("target_url", ""))
        supplied_target_url = action.config.target_url
        if preserve is not None and supplied_target_url in {"", _redact_url(old_target_url)}:
            target_url = old_target_url
        else:
            target_url = supplied_target_url
        if not target_url:
            raise AppError(422, "missing_action_secret", "A target URL is required.")
        target_url = await validate_outbound_url(
            target_url, allow_private=settings.allow_private_action_targets
        )
        if "headers" not in action.config.model_fields_set and preserve is not None:
            headers = dict(preserve.get("headers", {}))
        else:
            old_headers = dict((preserve or {}).get("headers", {}))
            headers = {
                key: old_headers.get(key, value) if value in {"", "••••••"} else value
                for key, value in action.config.headers.items()
            }
        timeout = action.config.timeout_seconds
        if timeout is None:
            timeout = float(
                (preserve or {}).get("timeout_seconds", settings.action_timeout_seconds)
            )
        config = {"target_url": target_url, "headers": headers, "timeout_seconds": timeout}
        safe = {
            "target_url": _redact_url(target_url),
            "target_url_configured": True,
            "headers": {key: "••••••" for key in headers},
            "timeout_seconds": timeout,
        }
        return _validated_action_configs(config, safe)

    assert isinstance(action, DiscordActionInput)
    old_webhook_url = str((preserve or {}).get("webhook_url", ""))
    supplied_webhook_url = action.config.webhook_url
    if preserve is not None and supplied_webhook_url in {"", _redact_url(old_webhook_url)}:
        webhook_url = old_webhook_url
    else:
        webhook_url = supplied_webhook_url
    if not webhook_url:
        raise AppError(422, "missing_action_secret", "A Discord webhook URL is required.")
    webhook_url = validate_discord_webhook_url(webhook_url)
    config = {
        "webhook_url": webhook_url,
        "message_template": action.config.message_template,
    }
    safe = {
        "webhook_url": _redact_url(webhook_url),
        "webhook_url_configured": True,
        "message_template": action.config.message_template,
    }
    return _validated_action_configs(config, safe)


def _workflow_query(user_id: UUID) -> Select[tuple[Workflow]]:
    return (
        select(Workflow)
        .options(selectinload(Workflow.condition), selectinload(Workflow.action))
        .where(Workflow.user_id == user_id)
    )


async def get_owned_workflow(
    workflow_id: UUID,
    user_id: UUID,
    session: AsyncSession,
    *,
    for_update: bool = False,
    nowait: bool = False,
) -> Workflow:
    statement = _workflow_query(user_id).where(Workflow.id == workflow_id)
    if for_update:
        statement = statement.with_for_update(nowait=nowait)
    try:
        workflow = await session.scalar(statement)
    except DBAPIError as exc:
        sqlstate = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
        await session.rollback()
        if nowait and sqlstate == "55P03":
            raise AppError(
                409, "workflow_busy", "The workflow is being changed by another request."
            ) from exc
        raise
    if workflow is None:
        raise not_found("Workflow")
    return workflow


def to_workflow_response(workflow: Workflow, settings: Settings) -> WorkflowResponse:
    token = _secret_box(settings).decrypt_text(workflow.webhook_token_encrypted)
    condition = None
    if workflow.condition is not None:
        condition = ConditionResponse(
            id=workflow.condition.id,
            field_path=workflow.condition.field_path,
            operator=ConditionOperator(workflow.condition.operator),
            comparison_value=workflow.condition.comparison_value,
        )
    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        is_enabled=workflow.is_enabled,
        webhook_url=f"{settings.public_base_url}/api/v1/hooks/{workflow.id}/{token}",
        condition=condition,
        action=ActionResponse(
            id=workflow.action.id,
            action_type=ActionType(workflow.action.action_type),
            config=workflow.action.safe_display_config,
        ),
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


def to_workflow_summary(workflow: Workflow) -> WorkflowSummary:
    condition = None
    if workflow.condition is not None:
        condition = ConditionResponse(
            id=workflow.condition.id,
            field_path=workflow.condition.field_path,
            operator=ConditionOperator(workflow.condition.operator),
            comparison_value=workflow.condition.comparison_value,
        )
    return WorkflowSummary(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        is_enabled=workflow.is_enabled,
        condition=condition,
        action=ActionSummary(action_type=ActionType(workflow.action.action_type)),
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


async def create_workflow(
    user: User, data: WorkflowCreate, session: AsyncSession, settings: Settings
) -> Workflow:
    raw_token = new_secret()
    box = _secret_box(settings)
    action_config, safe_config = await _prepare_action_config(data.action, settings)
    workflow = Workflow(
        user_id=user.id,
        name=data.name,
        description=data.description,
        is_enabled=data.is_enabled,
        webhook_token_hash=hash_secret(raw_token),
        webhook_token_encrypted=box.encrypt_text(raw_token),
    )
    workflow.condition = None
    if data.condition is not None:
        workflow.condition = WorkflowCondition(
            field_path=data.condition.field_path,
            operator=data.condition.operator.value,
            comparison_value=data.condition.comparison_value,
        )
    workflow.action = WorkflowAction(
        action_type=data.action.action_type.value,
        encrypted_config=box.encrypt_json(action_config),
        safe_display_config=safe_config,
    )
    session.add(workflow)
    await session.commit()
    return workflow


async def list_workflows(
    user_id: UUID, session: AsyncSession, page: int, page_size: int
) -> Paginated[WorkflowSummary]:
    total = int(
        await session.scalar(
            select(func.count()).select_from(Workflow).where(Workflow.user_id == user_id)
        )
        or 0
    )
    result = await session.scalars(
        _workflow_query(user_id)
        .order_by(Workflow.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [to_workflow_summary(workflow) for workflow in result.all()]
    return Paginated(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total else 0,
    )


async def update_workflow(
    workflow: Workflow,
    data: WorkflowUpdate,
    session: AsyncSession,
    settings: Settings,
) -> Workflow:
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        workflow.name = data.name
    if "description" in fields and data.description is not None:
        workflow.description = data.description
    if "is_enabled" in fields and data.is_enabled is not None:
        workflow.is_enabled = data.is_enabled
    if "condition" in fields:
        if data.condition is None:
            workflow.condition = None
        elif workflow.condition is None:
            workflow.condition = WorkflowCondition(
                field_path=data.condition.field_path,
                operator=data.condition.operator.value,
                comparison_value=data.condition.comparison_value,
            )
        else:
            workflow.condition.field_path = data.condition.field_path
            workflow.condition.operator = data.condition.operator.value
            workflow.condition.comparison_value = data.condition.comparison_value
    if "action" in fields and data.action is not None:
        box = _secret_box(settings)
        current_type = ActionType(workflow.action.action_type)
        current_config = box.decrypt_json(workflow.action.encrypted_config)
        config, safe_config = await _prepare_action_config(
            data.action, settings, current_type=current_type, current_config=current_config
        )
        workflow.action.action_type = data.action.action_type.value
        workflow.action.encrypted_config = box.encrypt_json(config)
        workflow.action.safe_display_config = safe_config
    await session.commit()
    return workflow


async def delete_workflow(workflow: Workflow, session: AsyncSession) -> None:
    await session.delete(workflow)
    await session.commit()


async def rotate_webhook_token(
    workflow: Workflow, session: AsyncSession, settings: Settings
) -> Workflow:
    raw_token = new_secret()
    workflow.webhook_token_hash = hash_secret(raw_token)
    workflow.webhook_token_encrypted = _secret_box(settings).encrypt_text(raw_token)
    await session.commit()
    return workflow
