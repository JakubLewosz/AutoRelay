from __future__ import annotations

import pytest
from app.core.config import Settings
from app.core.security import SecretBox, hash_password, verify_password
from app.models.enums import ConditionOperator
from app.services.conditions import ConditionEvaluationError, evaluate_condition
from app.services.network import validate_discord_webhook_url, validate_outbound_url
from cryptography.fernet import Fernet
from pydantic import ValidationError


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
    for unsafe_origins in ("*", "https://example.com/path", "javascript://example.com"):
        monkeypatch.setenv("CORS_ORIGINS", unsafe_origins)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)


def test_production_cannot_allow_private_action_targets() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            database_url="sqlite+aiosqlite:///:memory:",
            fernet_key=Fernet.generate_key().decode(),
            allow_private_action_targets=True,
        )


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
