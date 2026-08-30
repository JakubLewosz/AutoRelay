from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import AppSettings, CSRFProtectedAuth, CurrentAuth, DBSession
from app.models.enums import TriggerType
from app.schemas.common import Paginated
from app.schemas.execution import QueuedExecutionResponse
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowResponse,
    WorkflowSummary,
    WorkflowTestRequest,
    WorkflowUpdate,
)
from app.services.executions import queue_execution
from app.services.webhooks import ensure_test_payload_size
from app.services.workflows import (
    create_workflow,
    delete_workflow,
    get_owned_workflow,
    list_workflows,
    rotate_webhook_token,
    to_workflow_response,
    update_workflow,
)

router = APIRouter(prefix="/workflows", tags=["Workflows"])


@router.get("", response_model=Paginated[WorkflowSummary], summary="List workflows")
async def get_workflows(
    auth: CurrentAuth,
    session: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Paginated[WorkflowSummary]:
    return await list_workflows(auth.user.id, session, page, page_size)


@router.post(
    "",
    response_model=WorkflowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a workflow",
)
async def post_workflow(
    data: WorkflowCreate,
    auth: CSRFProtectedAuth,
    session: DBSession,
    settings: AppSettings,
) -> WorkflowResponse:
    workflow = await create_workflow(auth.user, data, session, settings)
    return to_workflow_response(workflow, settings)


@router.get("/{workflow_id}", response_model=WorkflowResponse, summary="Get a workflow")
async def get_workflow(
    workflow_id: UUID, auth: CurrentAuth, session: DBSession, settings: AppSettings
) -> WorkflowResponse:
    workflow = await get_owned_workflow(workflow_id, auth.user.id, session)
    return to_workflow_response(workflow, settings)


@router.patch("/{workflow_id}", response_model=WorkflowResponse, summary="Update a workflow")
async def patch_workflow(
    workflow_id: UUID,
    data: WorkflowUpdate,
    auth: CSRFProtectedAuth,
    session: DBSession,
    settings: AppSettings,
) -> WorkflowResponse:
    workflow = await get_owned_workflow(
        workflow_id, auth.user.id, session, for_update=True, nowait=True
    )
    workflow = await update_workflow(workflow, data, session, settings)
    return to_workflow_response(workflow, settings)


@router.delete(
    "/{workflow_id}",
    response_model=None,
    response_class=Response,
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a workflow",
)
async def remove_workflow(
    workflow_id: UUID, auth: CSRFProtectedAuth, session: DBSession
) -> Response:
    workflow = await get_owned_workflow(
        workflow_id, auth.user.id, session, for_update=True, nowait=True
    )
    await delete_workflow(workflow, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{workflow_id}/rotate-token",
    response_model=WorkflowResponse,
    summary="Rotate a webhook token",
)
async def rotate_token(
    workflow_id: UUID,
    auth: CSRFProtectedAuth,
    session: DBSession,
    settings: AppSettings,
) -> WorkflowResponse:
    workflow = await get_owned_workflow(
        workflow_id, auth.user.id, session, for_update=True, nowait=True
    )
    workflow = await rotate_webhook_token(workflow, session, settings)
    return to_workflow_response(workflow, settings)


@router.post(
    "/{workflow_id}/test",
    response_model=QueuedExecutionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a workflow test",
)
async def test_workflow(
    workflow_id: UUID,
    data: WorkflowTestRequest,
    auth: CSRFProtectedAuth,
    session: DBSession,
    settings: AppSettings,
) -> QueuedExecutionResponse:
    ensure_test_payload_size(data.payload, settings)
    workflow = await get_owned_workflow(workflow_id, auth.user.id, session)
    execution = await queue_execution(workflow, data.payload, TriggerType.TEST, session, settings)
    return QueuedExecutionResponse(execution_id=execution.id)
