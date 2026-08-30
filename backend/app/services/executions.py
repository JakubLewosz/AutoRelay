from __future__ import annotations

from datetime import timedelta
from math import ceil
from uuid import UUID

from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.db.base import utc_now
from app.models.enums import ExecutionStatus, TriggerType
from app.models.execution import Execution
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.common import Paginated
from app.schemas.execution import DashboardSummary, ExecutionResponse


def to_execution_response(execution: Execution) -> ExecutionResponse:
    return ExecutionResponse(
        id=execution.id,
        workflow_id=execution.workflow_id,
        workflow_name=execution.workflow.name,
        retry_of_execution_id=execution.retry_of_execution_id,
        status=execution.status,
        trigger_type=execution.trigger_type,
        input_payload=execution.input_payload,
        safe_result=execution.safe_result,
        error_code=execution.error_code,
        error_message=execution.error_message,
        attempt_count=execution.attempt_count,
        max_attempts=execution.max_attempts,
        next_attempt_at=execution.next_attempt_at,
        queued_at=execution.queued_at,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        duration_ms=execution.duration_ms,
        created_at=execution.created_at,
        updated_at=execution.updated_at,
    )


async def queue_execution(
    workflow: Workflow,
    payload: dict[str, object],
    trigger_type: TriggerType,
    session: AsyncSession,
    settings: Settings,
    *,
    retry_of_execution_id: UUID | None = None,
) -> Execution:
    execution = Execution(
        workflow_id=workflow.id,
        workflow=workflow,
        retry_of_execution_id=retry_of_execution_id,
        status=ExecutionStatus.QUEUED.value,
        trigger_type=trigger_type.value,
        input_payload=payload,
        attempt_count=0,
        max_attempts=settings.worker_max_attempts,
        queued_at=utc_now(),
    )
    session.add(execution)
    await session.commit()
    return execution


def _owned_execution_query(user_id: UUID) -> Select[tuple[Execution]]:
    return (
        select(Execution)
        .join(Workflow, Workflow.id == Execution.workflow_id)
        .options(selectinload(Execution.workflow))
        .where(Workflow.user_id == user_id)
    )


async def get_owned_execution(
    execution_id: UUID, user_id: UUID, session: AsyncSession
) -> Execution:
    execution = await session.scalar(
        _owned_execution_query(user_id).where(Execution.id == execution_id)
    )
    if execution is None:
        raise not_found("Execution")
    return execution


async def list_executions(
    user_id: UUID,
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: ExecutionStatus | None = None,
    workflow_id: UUID | None = None,
) -> Paginated[ExecutionResponse]:
    filters = [Workflow.user_id == user_id]
    if status is not None:
        filters.append(Execution.status == status.value)
    if workflow_id is not None:
        filters.append(Execution.workflow_id == workflow_id)
    total = int(
        await session.scalar(
            select(func.count())
            .select_from(Execution)
            .join(Workflow, Workflow.id == Execution.workflow_id)
            .where(*filters)
        )
        or 0
    )
    records = await session.scalars(
        select(Execution)
        .join(Workflow, Workflow.id == Execution.workflow_id)
        .options(selectinload(Execution.workflow))
        .where(*filters)
        .order_by(Execution.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Paginated(
        items=[to_execution_response(record) for record in records.all()],
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total else 0,
    )


async def manually_retry_execution(
    execution: Execution, session: AsyncSession, settings: Settings
) -> Execution:
    if execution.status != ExecutionStatus.FAILED.value:
        raise AppError(409, "execution_not_retryable", "Only failed executions can be retried.")
    return await queue_execution(
        execution.workflow,
        execution.input_payload,
        TriggerType.MANUAL_RETRY,
        session,
        settings,
        retry_of_execution_id=execution.id,
    )


async def dashboard_summary(user: User, session: AsyncSession) -> DashboardSummary:
    workflow_filter = Workflow.user_id == user.id
    total_workflows = int(
        await session.scalar(select(func.count()).select_from(Workflow).where(workflow_filter)) or 0
    )
    enabled_workflows = int(
        await session.scalar(
            select(func.count())
            .select_from(Workflow)
            .where(workflow_filter, Workflow.is_enabled.is_(True))
        )
        or 0
    )
    since = utc_now() - timedelta(hours=24)
    execution_base = and_(Workflow.user_id == user.id, Execution.created_at >= since)

    async def count_status(status: ExecutionStatus | None = None) -> int:
        statement = (
            select(func.count())
            .select_from(Execution)
            .join(Workflow, Workflow.id == Execution.workflow_id)
            .where(execution_base)
        )
        if status is not None:
            statement = statement.where(Execution.status == status.value)
        return int(await session.scalar(statement) or 0)

    recent = await session.scalars(
        select(Execution)
        .join(Workflow, Workflow.id == Execution.workflow_id)
        .options(selectinload(Execution.workflow))
        .where(Workflow.user_id == user.id)
        .order_by(Execution.created_at.desc())
        .limit(5)
    )
    return DashboardSummary(
        total_workflows=total_workflows,
        enabled_workflows=enabled_workflows,
        executions_last_24_hours=await count_status(),
        succeeded_executions=await count_status(ExecutionStatus.SUCCEEDED),
        failed_executions=await count_status(ExecutionStatus.FAILED),
        recent_executions=[to_execution_response(item) for item in recent.all()],
    )
