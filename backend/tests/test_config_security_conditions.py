from __future__ import annotations

from pathlib import Path

import pytest
from alembic.config import Config
from app.core.config import Settings, repository_environment_file
from app.core.security import SecretBox, hash_password, verify_password
from app.db.migration_config import escape_alembic_config_value
from app.models.enums import ConditionOperator
from app.schemas.workflow import ConditionInput, HTTPPostConfigInput, WorkflowTestRequest
from app.services.conditions import ConditionEvaluationError, evaluate_condition
from app.services.network import validate_discord_webhook_url, validate_outbound_url
from cryptography.fernet import Fernet
from pydantic import ValidationError
from tests.conftest import validate_destructive_test_database_url


def test_environment_file_is_anchored_to_repository_not_process_cwd(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    foreign_workspace = tmp_path / "unrelated-project"
    foreign_workspace.mkdir()
    (tmp_path / ".env").write_text("FOREIGN_SECRET=must-not-be-read\n", encoding="utf-8")
    monkeypatch.chdir(foreign_workspace)

    repository_root = Path(__file__).resolve().parents[2]
    assert repository_environment_file() == repository_root / ".env"
    assert Settings.model_config.get("env_file") is None


def test_settings_accept_app_env_and_comma_separated_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("FERNET_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, http://localhost:8080")
    settings = Settings(_env_file=None)
    assert settings.environment == "test"
    assert settings.cors_origins == ["http://localhost:5173", "http://localhost:8080"]


def test_settings_reject_wildcard_or_non_origin_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("FERNET_KEY", Fernet.generate_key().decode())
    for unsafe_origins in (
        "*",
        "https://example.com/path",
        "javascript://example.com",
        "https://example.com:invalid",
        "https://example.com:99999",
    ):
        monkeypatch.setenv("CORS_ORIGINS", unsafe_origins)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)


def test_public_base_url_is_an_origin_and_production_requires_https() -> None:
    common = {
        "_env_file": None,
        "database_url": "postgresql+asyncpg://user:password@localhost/autorelay",
        "fernet_key": Fernet.generate_key().decode(),
    }
    for unsafe_url in (
        "https://user:password@example.com",
        "https://example.com/path",
        "https://example.com?query=value",
        "https://example.com#fragment",
        "https://example.com:invalid",
        "https://example.com:99999",
        "http:///",
    ):
        with pytest.raises(ValidationError):
            Settings(public_base_url=unsafe_url, **common)
    with pytest.raises(ValidationError, match="HTTPS in production"):
        Settings(
            environment="production",
            session_cookie_secure=True,
            public_base_url="http://example.com",
            **common,
        )
    assert (
        Settings(
            environment="production",
            session_cookie_secure=True,
            public_base_url="https://example.com/",
            **common,
        ).public_base_url
        == "https://example.com"
    )


def test_settings_validation_errors_hide_secret_inputs() -> None:
    sentinel_password = "sentinel-database-password"
    sentinel_url_token = "sentinel-public-url-token"
    common = {
        "_env_file": None,
        "environment": "test",
        "fernet_key": Fernet.generate_key().decode(),
    }
    invalid_cases = (
        {
            "database_url": (f"mysql+async://user:{sentinel_password}@localhost/autorelay_test"),
            "public_base_url": "https://example.com",
            "sentinel": sentinel_password,
        },
        {
            "database_url": "postgresql+asyncpg://user:password@localhost/autorelay_test",
            "public_base_url": f"https://user:{sentinel_url_token}@example.com",
            "sentinel": sentinel_url_token,
        },
    )
    for invalid_case in invalid_cases:
        sentinel = invalid_case.pop("sentinel")
        with pytest.raises(ValidationError) as exc_info:
            Settings(**common, **invalid_case)
        assert sentinel not in str(exc_info.value)


def test_alembic_config_preserves_percent_encoded_database_url() -> None:
    database_url = "postgresql+asyncpg://user:password%40with%25encoding@localhost/autorelay_test"
    config = Config()
    config.set_main_option("sqlalchemy.url", escape_alembic_config_value(database_url))
    assert config.get_main_option("sqlalchemy.url") == database_url


def test_production_cannot_allow_private_action_targets() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            database_url="sqlite+aiosqlite:///:memory:",
            fernet_key=Fernet.generate_key().decode(),
            allow_private_action_targets=True,
        )


def test_sqlite_is_accepted_only_in_test_environment() -> None:
    common = {
        "_env_file": None,
        "database_url": "sqlite+aiosqlite:///:memory:",
        "fernet_key": Fernet.generate_key().decode(),
    }
    assert Settings(environment="test", **common).environment == "test"
    for environment in ("development", "production"):
        with pytest.raises(ValidationError, match="SQLite is supported only"):
            Settings(
                environment=environment,
                session_cookie_secure=environment == "production",
                **common,
            )


def test_destructive_database_guard_rejects_file_sqlite_and_non_test_postgres() -> None:
    validate_destructive_test_database_url("sqlite+aiosqlite:///:memory:")
    validate_destructive_test_database_url(
        "postgresql+asyncpg://user:password@localhost/autorelay_test"
    )
    for unsafe_url in (
        "sqlite+aiosqlite:////tmp/autorelay.db",
        "sqlite+aiosqlite:///autorelay_test.db",
        "postgresql+asyncpg://user:password@localhost/autorelay",
    ):
        with pytest.raises(RuntimeError):
            validate_destructive_test_database_url(unsafe_url)


def test_argon2_password_hashing_and_fernet_round_trip() -> None:
    password = "a long, unique passphrase"
    password_hash = hash_password(password)
    assert password not in password_hash
    assert password_hash.startswith("$argon2id$")
    assert verify_password(password_hash, password)
    assert not verify_password(password_hash, "wrong password")

    box = SecretBox(Fernet.generate_key().decode())
    encrypted = box.encrypt_json({"authorization": "very-secret"})
    assert "very-secret" not in encrypted
    assert box.decrypt_json(encrypted) == {"authorization": "very-secret"}


@pytest.mark.parametrize("header_value", ["żółć", "value\x00", " value ", "\tvalue"])
def test_http_header_values_are_transport_safe(header_value: str) -> None:
    with pytest.raises(ValidationError):
        HTTPPostConfigInput(target_url="https://example.com", headers={"X-Test": header_value})


@pytest.mark.parametrize(
    "header_name",
    [
        "hOsT",
        "CONTENT-length",
        "Transfer-Encoding",
        "connection",
        "ACCEPT-ENCODING",
        "Keep-Alive",
        "Proxy-Authenticate",
        "Proxy-Authorization",
        "TE",
        "Trailer",
        "Upgrade",
        "x-AutoRelay-execution-ID",
    ],
)
def test_managed_http_headers_are_case_insensitively_rejected(header_name: str) -> None:
    with pytest.raises(ValidationError):
        HTTPPostConfigInput(target_url="https://example.com", headers={header_name: "value"})


@pytest.mark.parametrize(
    ("operator", "comparison", "expected"),
    [
        (ConditionOperator.GREATER_THAN_OR_EQUAL, 1000, True),
        (ConditionOperator.LESS_THAN, 1000, False),
        (ConditionOperator.EQUALS, 1500, True),
        (ConditionOperator.NOT_EQUALS, 10, True),
        (ConditionOperator.EXISTS, None, True),
    ],
)
def test_condition_evaluation(
    operator: ConditionOperator, comparison: object, expected: bool
) -> None:
    assert (
        evaluate_condition({"lead": {"value": 1500}}, "lead.value", operator, comparison)
        is expected
    )


def test_condition_false_missing_and_incompatible_types() -> None:
    assert not evaluate_condition({"lead": {}}, "lead.value", ConditionOperator.GREATER_THAN, 10)
    assert evaluate_condition({"lead": {}}, "lead.value", ConditionOperator.DOES_NOT_EXIST, None)
    with pytest.raises(ConditionEvaluationError):
        evaluate_condition(
            {"lead": {"value": "expensive"}},
            "lead.value",
            ConditionOperator.GREATER_THAN,
            10,
        )


def test_condition_json_equality_keeps_booleans_distinct_from_numbers() -> None:
    assert not evaluate_condition({"value": True}, "value", ConditionOperator.EQUALS, 1)
    assert evaluate_condition({"value": False}, "value", ConditionOperator.NOT_EQUALS, 0)
    assert not evaluate_condition({"value": [True]}, "value", ConditionOperator.CONTAINS, 1)
    assert not evaluate_condition({"value": [0]}, "value", ConditionOperator.CONTAINS, False)
    assert evaluate_condition({"value": [1.0]}, "value", ConditionOperator.CONTAINS, 1)


def test_jsonb_schema_fields_reject_non_finite_or_unsafe_values() -> None:
    for unsafe_value in (float("nan"), float("inf"), "unsafe\x00value", "\ud800"):
        with pytest.raises(ValidationError):
            ConditionInput(
                field_path="value",
                operator=ConditionOperator.EQUALS,
                comparison_value=unsafe_value,
            )
        with pytest.raises(ValidationError):
            WorkflowTestRequest(payload={"value": unsafe_value})


@pytest.mark.asyncio
async def test_ssrf_blocking_and_explicit_test_allowance() -> None:
    assert (
        await validate_outbound_url("https://8.8.8.8/public", allow_private=False)
        == "https://8.8.8.8/public"
    )
    for blocked_url in (
        "http://127.0.0.1/internal",
        "http://100.100.100.200/latest/meta-data",
        "http://100.64.0.1/internal",
        "http://[fec0::1]/internal",
    ):
        with pytest.raises(Exception, match="not publicly routable"):
            await validate_outbound_url(blocked_url, allow_private=False)
    assert (
        await validate_outbound_url("http://127.0.0.1/internal", allow_private=True)
        == "http://127.0.0.1/internal"
    )
    assert (
        await validate_outbound_url("http://10.0.0.5/internal", allow_private=True)
        == "http://10.0.0.5/internal"
    )
    for always_blocked in (
        "http://100.64.0.1/internal",
        "http://224.0.0.1/internal",
        "http://0.0.0.0/internal",
        "http://240.0.0.1/internal",
        "http://169.254.169.254/latest/meta-data",
        "http://[fec0::1]/internal",
    ):
        with pytest.raises(Exception, match="not publicly routable"):
            await validate_outbound_url(always_blocked, allow_private=True)
    with pytest.raises(Exception, match="credentials"):
        await validate_outbound_url("https://user:pass@8.8.8.8/hook", allow_private=False)


def test_discord_url_validation_is_conservative() -> None:
    valid = "https://discord.com/api/webhooks/123/abc_DEF-456"
    assert validate_discord_webhook_url(valid) == valid
    with pytest.raises(Exception, match="recognized Discord host"):
        validate_discord_webhook_url("https://example.com/api/webhooks/123/token")
    with pytest.raises(Exception, match="path is invalid"):
        validate_discord_webhook_url("https://discord.com/channels/123")
