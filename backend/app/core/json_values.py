from __future__ import annotations

import math
from typing import Any

_MAX_JSON_DEPTH = 64
_MAX_JSON_NODES = 100_000


class InvalidJSONValue(ValueError):
    """Raised when a value cannot be represented safely as PostgreSQL JSONB."""


def validate_json_string(value: str) -> str:
    if "\x00" in value:
        raise InvalidJSONValue("JSON strings cannot contain NUL characters")
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise InvalidJSONValue("JSON strings cannot contain unpaired Unicode surrogates")
    return value


def validate_jsonb_value(value: Any) -> Any:
    """Validate standard JSON types, finite numbers, Unicode, and bounded nesting."""

    stack: list[tuple[Any, int]] = [(value, 0)]
    visited = 0
    while stack:
        current, depth = stack.pop()
        visited += 1
        if visited > _MAX_JSON_NODES:
            raise InvalidJSONValue("JSON contains too many values")
        if depth > _MAX_JSON_DEPTH:
            raise InvalidJSONValue("JSON nesting is too deep")
        if current is None or isinstance(current, bool | int):
            continue
        if isinstance(current, float):
            if not math.isfinite(current):
                raise InvalidJSONValue("JSON numbers must be finite")
            continue
        if isinstance(current, str):
            validate_json_string(current)
            continue
        if isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)
            continue
        if isinstance(current, dict):
            for key, item in current.items():
                if not isinstance(key, str):
                    raise InvalidJSONValue("JSON object keys must be strings")
                validate_json_string(key)
                stack.append((item, depth + 1))
            continue
        raise InvalidJSONValue("The value contains a type that JSON does not support")
    return value


def parse_finite_json_float(raw_value: str) -> float:
    value = float(raw_value)
    if not math.isfinite(value):
        raise InvalidJSONValue("JSON numbers must be finite")
    return value


def reject_json_constant(_raw_value: str) -> None:
    raise InvalidJSONValue("Non-standard JSON numeric constants are not accepted")
