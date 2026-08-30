from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.models.enums import ExecutionStatus, TriggerType
from app.schemas.common import APIModel


class ExecutionResponse(APIModel):
    id: UUID
    workflow_id: UUID
    workflow_name: str
    retry_of_execution_id: UUID | None
    status: ExecutionStatus
    trigger_type: TriggerType
    input_payload: dict[str, Any]
    safe_result: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime | None
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    created_at: datetime
    updated_at: datetime


class QueuedExecutionResponse(APIModel):
    execution_id: UUID
    status: ExecutionStatus = ExecutionStatus.QUEUED


class DashboardSummary(APIModel):
    total_workflows: int = Field(ge=0)
    enabled_workflows: int = Field(ge=0)
    executions_last_24_hours: int = Field(ge=0)
    succeeded_executions: int = Field(ge=0)
    failed_executions: int = Field(ge=0)
    recent_executions: list[ExecutionResponse]
