from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.core.json_values import validate_json_string, validate_jsonb_value
from app.models.enums import ActionType, ConditionOperator
from app.schemas.common import APIModel

_FIELD_PATH = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$")
_HEADER_NAME = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
_COMPARISON_OPERATORS = {
    ConditionOperator.EQUALS,
    ConditionOperator.NOT_EQUALS,
    ConditionOperator.CONTAINS,
    ConditionOperator.GREATER_THAN,
    ConditionOperator.GREATER_THAN_OR_EQUAL,
    ConditionOperator.LESS_THAN,
    ConditionOperator.LESS_THAN_OR_EQUAL,
}


class ConditionInput(APIModel):
    field_path: str = Field(min_length=1, max_length=255)
    operator: ConditionOperator
    comparison_value: Any | None = None

    @field_validator("field_path")
    @classmethod
    def validate_field_path(cls, value: str) -> str:
        normalized = value.strip()
        if not _FIELD_PATH.fullmatch(normalized):
            raise ValueError("field_path must be a dot-separated JSON object path")
        return normalized

    @model_validator(mode="after")
    def validate_comparison(self) -> ConditionInput:
        validate_jsonb_value(self.comparison_value)
        if self.operator in _COMPARISON_OPERATORS and self.comparison_value is None:
            raise ValueError(f"comparison_value is required for {self.operator.value}")
        if self.operator not in _COMPARISON_OPERATORS and self.comparison_value is not None:
            raise ValueError(f"comparison_value is not accepted for {self.operator.value}")
        if self.operator in {
            ConditionOperator.GREATER_THAN,
            ConditionOperator.GREATER_THAN_OR_EQUAL,
            ConditionOperator.LESS_THAN,
            ConditionOperator.LESS_THAN_OR_EQUAL,
        } and (
            isinstance(self.comparison_value, bool)
            or not isinstance(self.comparison_value, int | float)
        ):
            raise ValueError("numeric operators require a numeric comparison_value")
        return self


class HTTPPostConfigInput(APIModel):
    target_url: str = Field(default="", max_length=2048)
    headers: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: float | None = Field(default=None, ge=1.0, le=30.0)

    @field_validator("target_url")
    @classmethod
    def normalize_target_url(cls, value: str) -> str:
        return value.strip()

    @field_validator("headers")
    @classmethod
    def validate_headers(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 20:
            raise ValueError("at most 20 custom headers are allowed")
        normalized: dict[str, str] = {}
        forbidden = {
            "host",
            "content-length",
            "cookie",
            "transfer-encoding",
            "connection",
            "accept-encoding",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "upgrade",
        }
        for raw_name, raw_value in value.items():
            name = raw_name.strip()
            if not name or len(name) > 128 or not _HEADER_NAME.fullmatch(name):
                raise ValueError("custom header names must be valid HTTP token values")
            if name.casefold() in forbidden or name.casefold() == "x-autorelay-execution-id":
                raise ValueError(f"custom header {name!r} is managed or forbidden")
            if len(raw_value) > 4096:
                raise ValueError("custom header values must be at most 4096 characters")
            if raw_value and (raw_value[0] in " \t" or raw_value[-1] in " \t"):
                raise ValueError("custom header values cannot have leading or trailing whitespace")
            if not raw_value.isascii() or any(
                character != "\t" and not 0x20 <= ord(character) <= 0x7E for character in raw_value
            ):
                raise ValueError("custom header values must contain safe ASCII field-value bytes")
            normalized[name] = raw_value
        return normalized


class DiscordConfigInput(APIModel):
    webhook_url: str = Field(default="", max_length=2048)
    message_template: str = Field(min_length=1, max_length=2000)

    @field_validator("webhook_url")
    @classmethod
    def normalize_webhook_url(cls, value: str) -> str:
        return value.strip()

    @field_validator("message_template")
    @classmethod
    def validate_message_template(cls, value: str) -> str:
        return validate_json_string(value)


class HTTPActionInput(APIModel):
    action_type: Literal[ActionType.HTTP_POST]
    config: HTTPPostConfigInput


class DiscordActionInput(APIModel):
    action_type: Literal[ActionType.DISCORD_WEBHOOK]
    config: DiscordConfigInput


ActionInput = Annotated[HTTPActionInput | DiscordActionInput, Field(discriminator="action_type")]


class WorkflowCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    is_enabled: bool = False
    condition: ConditionInput | None = None
    action: ActionInput

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return validate_json_string(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        return validate_json_string(value)


class WorkflowUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    is_enabled: bool | None = None
    condition: ConditionInput | None = None
    action: ActionInput | None = None

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return validate_json_string(value)

    @field_validator("description")
    @classmethod
    def validate_optional_description(cls, value: str | None) -> str | None:
        return validate_json_string(value) if value is not None else None


class ConditionResponse(APIModel):
    id: UUID
    field_path: str
    operator: ConditionOperator
    comparison_value: Any | None


class ActionResponse(APIModel):
    id: UUID
    action_type: ActionType
    config: dict[str, Any]


class ActionSummary(APIModel):
    action_type: ActionType


class WorkflowSummary(APIModel):
    id: UUID
    name: str
    description: str
    is_enabled: bool
    condition: ConditionResponse | None
    action: ActionSummary
    created_at: datetime
    updated_at: datetime


class WorkflowResponse(APIModel):
    id: UUID
    name: str
    description: str
    is_enabled: bool
    webhook_url: str
    condition: ConditionResponse | None
    action: ActionResponse
    created_at: datetime
    updated_at: datetime


class WorkflowTestRequest(APIModel):
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def validate_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        validate_jsonb_value(value)
        return value
