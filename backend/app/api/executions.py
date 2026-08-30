from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.dependencies import AppSettings, CSRFProtectedAuth, CurrentAuth, DBSession
from app.models.enums import ExecutionStatus
from app.schemas.common import Paginated
from app.schemas.execution import DashboardSummary, ExecutionResponse, ExecutionSummary
from app.services.executions import (
    dashboard_summary,
    get_owned_execution,
    list_executions,
    manually_retry_execution,
    to_execution_response,
)

router = APIRouter(tags=["Executions"])


@router.get("/executions", response_model=Paginated[ExecutionSummary], summary="List executions")
async def get_executions(
    auth: CurrentAuth,
    session: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    execution_status: Annotated[ExecutionStatus | None, Query(alias="status")] = None,
    workflow_id: UUID | None = None,
) -> Paginated[ExecutionSummary]:
    return await list_executions(
        auth.user.id,
        session,
        page=page,
        page_size=page_size,
        status=execution_status,
        workflow_id=workflow_id,
    )


@router.get(
    "/executions/{execution_id}", response_model=ExecutionResponse, summary="Get an execution"
)
async def get_execution(
    execution_id: UUID, auth: CurrentAuth, session: DBSession
) -> ExecutionResponse:
    execution = await get_owned_execution(execution_id, auth.user.id, session)
    return to_execution_response(execution)


@router.post(
    "/executions/{execution_id}/retry",
    response_model=ExecutionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry a failed execution",
)
async def retry_execution(
    execution_id: UUID,
    auth: CSRFProtectedAuth,
    session: DBSession,
    settings: AppSettings,
) -> ExecutionResponse:
    execution = await get_owned_execution(execution_id, auth.user.id, session)
    retry = await manually_retry_execution(execution, session, settings)
    return to_execution_response(retry)


@router.get("/dashboard", response_model=DashboardSummary, summary="Get dashboard summary")
async def get_dashboard(auth: CurrentAuth, session: DBSession) -> DashboardSummary:
    return await dashboard_summary(auth.user, session)
