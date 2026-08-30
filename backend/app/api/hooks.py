from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request, status

from app.api.dependencies import AppSettings, DBSession
from app.models.enums import TriggerType
from app.schemas.execution import QueuedExecutionResponse
from app.services.executions import queue_execution
from app.services.webhooks import authenticate_webhook, read_json_object

router = APIRouter(prefix="/hooks", tags=["Public webhooks"])


@router.post(
    "/{workflow_id}/{webhook_token}",
    response_model=QueuedExecutionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Receive a workflow webhook",
)
async def receive_webhook(
    workflow_id: UUID,
    webhook_token: str,
    request: Request,
    session: DBSession,
    settings: AppSettings,
) -> QueuedExecutionResponse:
    payload = await read_json_object(request, settings.webhook_max_payload_bytes)
    workflow = await authenticate_webhook(workflow_id, webhook_token, session)
    execution = await queue_execution(workflow, payload, TriggerType.WEBHOOK, session, settings)
    return QueuedExecutionResponse(execution_id=execution.id)
