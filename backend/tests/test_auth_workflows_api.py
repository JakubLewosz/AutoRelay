from __future__ import annotations

from datetime import timedelta
from urllib.parse import urlsplit

import httpx
import pytest
from app.db.base import utc_now
from app.models.session import UserSession
from app.models.user import User
from app.models.workflow import WorkflowAction
from sqlalchemy import select
from tests.conftest import BackendTestContext, discord_workflow_payload, register


@pytest.mark.asyncio
async def test_registration_login_logout_and_password_storage(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    csrf = await register(client, email="  Owner@Example.COM ")
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.headers["Cache-Control"] == "no-store"
    assert me.json()["user"]["email"] == "owner@example.com"

    async with context.factory() as session:
        user = await session.scalar(select(User))
        assert user is not None
        assert user.password_hash != "correct horse battery staple"
        assert user.password_hash.startswith("$argon2id$")

    rejected = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "incorrect"},
    )
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "invalid_credentials"

    logout = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout.status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401

    login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "OWNER@example.com",
            "password": "correct horse battery staple",
        },
    )
    assert login.status_code == 200
    assert login.json()["csrf_token"]


@pytest.mark.asyncio
async def test_session_expiration_is_rejected(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    await register(client)
    async with context.factory() as session:
        record = await session.scalar(select(UserSession))
        assert record is not None
        record.expires_at = utc_now() - timedelta(seconds=1)
        await session.commit()
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_session"


@pytest.mark.asyncio
async def test_csrf_workflow_crud_redaction_and_encryption(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    csrf = await register(client)
    payload = discord_workflow_payload()
    forbidden = await client.post("/api/v1/workflows", json=payload)
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "csrf_validation_failed"

    created = await client.post("/api/v1/workflows", json=payload, headers={"X-CSRF-Token": csrf})
    assert created.status_code == 201, created.text
    workflow = created.json()
    assert workflow["name"] == "High-value lead"
    assert workflow["is_enabled"] is True
    assert workflow["condition"]["operator"] == "greater_than_or_equal"
    assert "very-secret-token" not in str(workflow["action"]["config"])
    assert "••••••" in workflow["action"]["config"]["webhook_url"]
    assert created.headers["Cache-Control"] == "no-store"

    tested = await client.post(
        f"/api/v1/workflows/{workflow['id']}/test",
        json={"payload": {"lead": {"value": 1500}}},
        headers={"X-CSRF-Token": csrf},
    )
    assert tested.status_code == 202
    assert set(tested.json()) == {"execution_id", "status"}
    assert tested.json()["status"] == "queued"

    async with context.factory() as session:
        action = await session.scalar(select(WorkflowAction))
        assert action is not None
        assert "very-secret-token" not in action.encrypted_config

    updated = await client.patch(
        f"/api/v1/workflows/{workflow['id']}",
        json={
            "name": "Important lead",
            "is_enabled": False,
            "condition": None,
            "action": {
                "action_type": "DISCORD_WEBHOOK",
                "config": {"webhook_url": "", "message_template": "Updated {{ lead.name }}"},
            },
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Important lead"
    assert updated.json()["condition"] is None
    assert updated.json()["action"]["config"]["message_template"].startswith("Updated")

    listing = await client.get("/api/v1/workflows?page=1&page_size=10")
    assert listing.json()["total"] == 1
    assert listing.json()["pages"] == 1


@pytest.mark.asyncio
async def test_workflow_and_execution_ownership_isolation(context: BackendTestContext) -> None:
    transport = context.transport()
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as first,
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as second,
    ):
        first_csrf = await register(first, email="first@example.com")
        await register(second, email="second@example.com")
        created = await first.post(
            "/api/v1/workflows",
            json=discord_workflow_payload(),
            headers={"X-CSRF-Token": first_csrf},
        )
        workflow = created.json()
        hook_path = urlsplit(workflow["webhook_url"]).path
        queued = await first.post(
            hook_path,
            json={"lead": {"name": "Example", "value": 1500}},
        )
        execution_id = queued.json()["execution_id"]

        assert (await second.get(f"/api/v1/workflows/{workflow['id']}")).status_code == 404
        assert (await second.get(f"/api/v1/executions/{execution_id}")).status_code == 404


@pytest.mark.asyncio
async def test_webhook_rotation_json_and_size_validation(
    client: httpx.AsyncClient, context: BackendTestContext
) -> None:
    csrf = await register(client)
    created = await client.post(
        "/api/v1/workflows",
        json=discord_workflow_payload(),
        headers={"X-CSRF-Token": csrf},
    )
    workflow = created.json()
    old_path = urlsplit(workflow["webhook_url"]).path
    accepted = await client.post(old_path, json={"lead": {"value": 1200}})
    assert accepted.status_code == 202

    not_json = await client.post(old_path, content="hello", headers={"Content-Type": "text/plain"})
    assert not_json.status_code == 415
    nonstandard_json = await client.post(
        old_path, content=b'{"value": NaN}', headers={"Content-Type": "application/json"}
    )
    assert nonstandard_json.status_code == 400
    assert nonstandard_json.json()["error"]["code"] == "invalid_json"
    too_large = await client.post(old_path, json={"value": "x" * 1100})
    assert too_large.status_code == 413

    rotated = await client.post(
        f"/api/v1/workflows/{workflow['id']}/rotate-token",
        headers={"X-CSRF-Token": csrf},
    )
    assert rotated.status_code == 200
    new_path = urlsplit(rotated.json()["webhook_url"]).path
    assert new_path != old_path
    assert (await client.post(old_path, json={"lead": {"value": 1200}})).status_code == 404
    assert (await client.post(new_path, json={"lead": {"value": 1200}})).status_code == 202


@pytest.mark.asyncio
async def test_health_and_structured_validation_errors(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/health")).json() == {"status": "ok"}
    assert (await client.get("/api/ready")).json() == {"status": "ready"}
    response = await client.post(
        "/api/v1/auth/register", json={"email": "not-an-email", "password": "short"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.headers["X-Request-ID"]
    assert '"input":"short"' not in response.text
