from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import UUID

import httpx
import pytest
import respx
from app.db.base import utc_now
from app.models.enums import ExecutionStatus
from app.models.execution import Execution
from app.services.queue import (
    claim_executions,
    configure_worker_logging,
    process_execution,
    recover_stale_executions,
)
from tests.conftest import BackendTestContext, register


def http_workflow_payload(target_url: str, *, condition: bool = False) -> dict[str, object]:
    body: dict[str, object] = {
        "name": "HTTP relay",
        "is_enabled": True,
        "action": {
            "action_type": "HTTP_POST",
            "config": {
                "target_url": target_url,
                "headers": {"Authorization": "Bearer secret"},
                "timeout_seconds": 5,
            },
        },
    }
    if condition:
        body["condition"] = {
            "field_path": "lead.value",
            "operator": "greater_than_or_equal",
            "comparison_value": 1000,
        }
    return body


async def queue_http_execution(
    client: httpx.AsyncClient,
    target_url: str,
    *,
    condition: bool = False,
    value: object = 1500,
) -> tuple[str, str]:
    csrf = await register(client)
    created = await client.post(
        "/api/v1/workflows",
        json=http_workflow_payload(target_url, condition=condition),
        headers={"X-CSRF-Token": csrf},
    )
    assert created.status_code == 201, created.text
    safe_target = created.json()["action"]["config"]["target_url"]
    assert safe_target == "https://8.8.8.8/••••••"
    assert urlsplit(target_url).path not in safe_target
    hook_path = urlsplit(created.json()["webhook_url"]).path
    queued = await client.post(hook_path, json={"lead": {"name": "Example", "value": value}})
    assert queued.status_code == 202, queued.text
    return queued.json()["execution_id"], csrf


@pytest.mark.asyncio
@respx.mock
async def test_worker_claims_and_completes_success(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    target = respx.post("https://8.8.8.8/action").mock(
        return_value=httpx.Response(204, content=b"x" * 70_000)
    )
    execution_id, _ = await queue_http_execution(client, "https://8.8.8.8/action")

    claimed = await claim_executions(context.factory, 4)
    assert [str(item) for item in claimed] == [execution_id]
    assert await claim_executions(context.factory, 4) == []
    await process_execution(claimed[0], context.factory, context.settings)
    assert target.called
    request = target.calls.last.request
    assert request.headers["X-AutoRelay-Execution-ID"] == execution_id
    assert request.headers["Authorization"] == "Bearer secret"
    assert json.loads(request.content) == {"lead": {"name": "Example", "value": 1500}}

    detail = await client.get(f"/api/v1/executions/{execution_id}")
    assert detail.json()["status"] == "succeeded"
    assert detail.json()["attempt_count"] == 1
    assert detail.json()["safe_result"]["action"]["status_code"] == 204
    assert detail.json()["safe_result"]["action"]["response_bytes"] == 65_536
    assert detail.json()["safe_result"]["action"]["response_truncated"] is True
    assert "secret" not in str(detail.json()["safe_result"])


@pytest.mark.asyncio
async def test_worker_suppresses_secret_bearing_http_client_logs(
    context: BackendTestContext,
) -> None:
    configure_worker_logging(context.settings)
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() >= logging.WARNING


@pytest.mark.asyncio
@respx.mock
async def test_false_condition_skips_without_calling_action(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    target = respx.post("https://8.8.8.8/action").mock(return_value=httpx.Response(200))
    execution_id, _ = await queue_http_execution(
        client, "https://8.8.8.8/action", condition=True, value=10
    )
    claimed = await claim_executions(context.factory, 1)
    await process_execution(claimed[0], context.factory, context.settings)
    assert not target.called
    detail = await client.get(f"/api/v1/executions/{execution_id}")
    assert detail.json()["status"] == "skipped"
    assert detail.json()["safe_result"] == {"condition_passed": False}


@pytest.mark.asyncio
@respx.mock
async def test_incompatible_condition_becomes_safe_failure(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    execution_id, _ = await queue_http_execution(
        client, "https://8.8.8.8/action", condition=True, value="large"
    )
    claimed = await claim_executions(context.factory, 1)
    await process_execution(claimed[0], context.factory, context.settings)
    detail = await client.get(f"/api/v1/executions/{execution_id}")
    assert detail.json()["status"] == "failed"
    assert detail.json()["error_code"] == "condition_type_mismatch"


@pytest.mark.asyncio
@respx.mock
async def test_retryable_and_terminal_http_failures_and_manual_retry(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    target = respx.post("https://8.8.8.8/action").mock(return_value=httpx.Response(503))
    execution_id, csrf = await queue_http_execution(client, "https://8.8.8.8/action")
    claimed = await claim_executions(context.factory, 1)
    await process_execution(claimed[0], context.factory, context.settings)
    queued = await client.get(f"/api/v1/executions/{execution_id}")
    assert queued.json()["status"] == "queued"
    assert queued.json()["next_attempt_at"] is not None

    async with context.factory() as session:
        execution = await session.get(Execution, UUID(execution_id))
        assert execution is not None
        execution.next_attempt_at = utc_now()
        execution.max_attempts = 2
        await session.commit()
    target.mock(return_value=httpx.Response(400))
    claimed = await claim_executions(context.factory, 1)
    await process_execution(claimed[0], context.factory, context.settings)
    failed = await client.get(f"/api/v1/executions/{execution_id}")
    assert failed.json()["status"] == "failed"
    assert failed.json()["error_message"] == "The action target returned HTTP 400."

    manual = await client.post(
        f"/api/v1/executions/{execution_id}/retry", headers={"X-CSRF-Token": csrf}
    )
    assert manual.status_code == 202
    assert manual.json()["status"] == "queued"
    assert manual.json()["retry_of_execution_id"] == execution_id


@pytest.mark.asyncio
async def test_stale_execution_recovery(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    execution_id, _ = await queue_http_execution(client, "https://8.8.8.8/action")
    claimed = await claim_executions(context.factory, 1)
    assert str(claimed[0]) == execution_id
    async with context.factory() as session:
        execution = await session.get(Execution, claimed[0])
        assert execution is not None
        execution.started_at = utc_now() - timedelta(seconds=600)
        await session.commit()
    recovered = await recover_stale_executions(context.factory, context.settings)
    assert recovered == 1
    async with context.factory() as session:
        execution = await session.get(Execution, claimed[0])
        assert execution is not None
        assert execution.status == ExecutionStatus.QUEUED.value
        assert execution.error_code == "stale_execution"


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_concurrent_claims_are_disjoint(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    if context.engine.dialect.name != "postgresql":
        pytest.skip("concurrent SKIP LOCKED behavior requires PostgreSQL")
    csrf = await register(client)
    created = await client.post(
        "/api/v1/workflows",
        json=http_workflow_payload("https://8.8.8.8/action"),
        headers={"X-CSRF-Token": csrf},
    )
    hook_path = urlsplit(created.json()["webhook_url"]).path
    queued_ids: set[str] = set()
    for number in range(4):
        queued = await client.post(hook_path, json={"number": number})
        queued_ids.add(queued.json()["execution_id"])
    first, second = await asyncio.gather(
        claim_executions(context.factory, 2), claim_executions(context.factory, 2)
    )
    first_ids = {str(execution_id) for execution_id in first}
    second_ids = {str(execution_id) for execution_id in second}
    assert first_ids.isdisjoint(second_ids)
    assert first_ids | second_ids == queued_ids
