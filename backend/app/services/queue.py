from __future__ import annotations

import asyncio
import logging
import signal
from dataclasses import dataclass
from datetime import timedelta
from time import monotonic
from uuid import UUID

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.config import Settings, load_settings
from app.core.security import SecretBox
from app.db.base import utc_now
from app.db.session import SessionFactory, create_engine_and_session_factory
from app.models.enums import ExecutionStatus
from app.models.execution import Execution
from app.models.workflow import Workflow
from app.services.actions import ActionResult, execute_action
from app.services.conditions import ConditionEvaluationError, evaluate_condition

logger = logging.getLogger("autorelay.worker")


@dataclass(frozen=True, slots=True)
class WorkItem:
    id: UUID
    attempt_count: int
    max_attempts: int
    input_payload: dict[str, object]
    action_type: str
    encrypted_config: str
    condition_field_path: str | None
    condition_operator: str | None
    condition_comparison_value: object | None


def configure_worker_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # httpx's INFO request line contains the complete outbound URL. Webhook
    # paths and queries commonly contain credentials, so dependency logging is
    # kept above its request/connection trace levels.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


async def claim_executions(factory: SessionFactory, limit: int) -> list[UUID]:
    now = utc_now()
    async with factory() as session, session.begin():
        records = await session.scalars(
            select(Execution)
            .where(
                Execution.status == ExecutionStatus.QUEUED.value,
                or_(Execution.next_attempt_at.is_(None), Execution.next_attempt_at <= now),
            )
            .order_by(Execution.queued_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        claimed = records.all()
        for execution in claimed:
            execution.status = ExecutionStatus.RUNNING.value
            execution.started_at = now
            execution.completed_at = None
            execution.next_attempt_at = None
            execution.attempt_count += 1
        return [execution.id for execution in claimed]


async def _load_work_item(execution_id: UUID, factory: SessionFactory) -> WorkItem | None:
    async with factory() as session:
        execution = await session.scalar(
            select(Execution)
            .options(
                selectinload(Execution.workflow).selectinload(Workflow.condition),
                selectinload(Execution.workflow).selectinload(Workflow.action),
            )
            .where(
                Execution.id == execution_id,
                Execution.status == ExecutionStatus.RUNNING.value,
            )
        )
        if execution is None:
            return None
        condition = execution.workflow.condition
        item = WorkItem(
            id=execution.id,
            attempt_count=execution.attempt_count,
            max_attempts=execution.max_attempts,
            input_payload=execution.input_payload,
            action_type=execution.workflow.action.action_type,
            encrypted_config=execution.workflow.action.encrypted_config,
            condition_field_path=condition.field_path if condition else None,
            condition_operator=condition.operator if condition else None,
            condition_comparison_value=condition.comparison_value if condition else None,
        )
        await session.rollback()
        return item


async def _complete(
    execution_id: UUID,
    factory: SessionFactory,
    *,
    status: ExecutionStatus,
    duration_ms: int,
    safe_result: dict[str, object] | None,
    error_code: str | None = None,
    error_message: str | None = None,
    retry_at: object | None = None,
) -> None:
    async with factory() as session, session.begin():
        execution = await session.scalar(
            select(Execution)
            .where(
                Execution.id == execution_id,
                Execution.status == ExecutionStatus.RUNNING.value,
            )
            .with_for_update()
        )
        if execution is None:
            return
        execution.status = status.value
        execution.duration_ms = duration_ms
        execution.safe_result = safe_result
        execution.error_code = error_code
        execution.error_message = error_message
        if status is ExecutionStatus.QUEUED:
            execution.next_attempt_at = retry_at  # type: ignore[assignment]
            execution.completed_at = None
        else:
            execution.next_attempt_at = None
            execution.completed_at = utc_now()


async def process_execution(
    execution_id: UUID,
    factory: SessionFactory,
    settings: Settings,
    *,
    client: httpx.AsyncClient | None = None,
) -> None:
    started = monotonic()
    item = await _load_work_item(execution_id, factory)
    if item is None:
        return
    if item.condition_field_path is not None and item.condition_operator is not None:
        try:
            condition_passed = evaluate_condition(
                item.input_payload,
                item.condition_field_path,
                item.condition_operator,
                item.condition_comparison_value,
            )
        except ConditionEvaluationError:
            await _complete(
                item.id,
                factory,
                status=ExecutionStatus.FAILED,
                duration_ms=int((monotonic() - started) * 1000),
                safe_result={"condition_passed": None},
                error_code="condition_type_mismatch",
                error_message="The incoming payload is incompatible with the configured condition.",
            )
            return
        if not condition_passed:
            await _complete(
                item.id,
                factory,
                status=ExecutionStatus.SKIPPED,
                duration_ms=int((monotonic() - started) * 1000),
                safe_result={"condition_passed": False},
            )
            return
    try:
        config = SecretBox(settings.fernet_key.get_secret_value()).decrypt_json(
            item.encrypted_config
        )
    except ValueError:
        await _complete(
            item.id,
            factory,
            status=ExecutionStatus.FAILED,
            duration_ms=int((monotonic() - started) * 1000),
            safe_result={"condition_passed": True},
            error_code="action_config_unavailable",
            error_message="The action configuration is unavailable.",
        )
        return
    try:
        result = await execute_action(
            item.action_type, config, item.input_payload, item.id, settings, client=client
        )
    except Exception:
        # Exception values can contain target URLs, so log only the safe execution ID.
        logger.error("Unexpected action processing failure for execution %s", item.id)
        result = ActionResult(
            False,
            True,
            {"outcome": "internal_error"},
            "action_internal_error",
            "The action could not be processed.",
        )
    duration_ms = int((monotonic() - started) * 1000)
    safe_result = {"condition_passed": True, "action": result.safe_result}
    if result.succeeded:
        await _complete(
            item.id,
            factory,
            status=ExecutionStatus.SUCCEEDED,
            duration_ms=duration_ms,
            safe_result=safe_result,
        )
        return
    if result.retryable and item.attempt_count < item.max_attempts:
        delay = min(
            settings.worker_retry_base_seconds * (2 ** (item.attempt_count - 1)),
            settings.worker_retry_max_seconds,
        )
        await _complete(
            item.id,
            factory,
            status=ExecutionStatus.QUEUED,
            duration_ms=duration_ms,
            safe_result=safe_result,
            error_code=result.error_code,
            error_message=result.error_message,
            retry_at=utc_now() + timedelta(seconds=delay),
        )
        return
    await _complete(
        item.id,
        factory,
        status=ExecutionStatus.FAILED,
        duration_ms=duration_ms,
        safe_result=safe_result,
        error_code=result.error_code,
        error_message=result.error_message,
    )


async def recover_stale_executions(factory: SessionFactory, settings: Settings) -> int:
    cutoff = utc_now() - timedelta(seconds=settings.worker_stale_after_seconds)
    recovered = 0
    async with factory() as session, session.begin():
        records = await session.scalars(
            select(Execution)
            .where(
                Execution.status == ExecutionStatus.RUNNING.value,
                Execution.started_at < cutoff,
            )
            .with_for_update(skip_locked=True)
        )
        for execution in records.all():
            recovered += 1
            execution.error_code = "stale_execution"
            execution.error_message = "The worker stopped before this attempt completed."
            if execution.attempt_count >= execution.max_attempts:
                execution.status = ExecutionStatus.FAILED.value
                execution.completed_at = utc_now()
                execution.next_attempt_at = None
            else:
                execution.status = ExecutionStatus.QUEUED.value
                execution.next_attempt_at = utc_now()
                execution.completed_at = None
    return recovered


async def run_worker(settings: Settings | None = None) -> None:
    settings = settings or load_settings()
    configure_worker_logging(settings)
    engine, factory = create_engine_and_session_factory(settings)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_name, stop_event.set)
        except NotImplementedError:
            pass
    try:
        while not stop_event.is_set():
            recovered = await recover_stale_executions(factory, settings)
            if recovered:
                logger.warning("Recovered %d stale executions", recovered)
            claimed = await claim_executions(factory, settings.worker_concurrency)
            if claimed:
                await asyncio.gather(
                    *(
                        process_execution(execution_id, factory, settings)
                        for execution_id in claimed
                    )
                )
                continue
            try:
                await asyncio.wait_for(
                    stop_event.wait(), timeout=settings.worker_poll_interval_seconds
                )
            except TimeoutError:
                pass
    finally:
        await engine.dispose()
