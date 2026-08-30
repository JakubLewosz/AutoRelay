from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypeGuard

from app.models.enums import ConditionOperator

_MISSING = object()


@dataclass(slots=True)
class ConditionEvaluationError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


def resolve_dot_path(payload: dict[str, Any], field_path: str) -> object:
    current: object = payload
    for segment in field_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return _MISSING
        current = current[segment]
    return current


def _is_number(value: object) -> TypeGuard[int | float]:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _json_equal(left: object, right: object) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if _is_number(left) and _is_number(right):
        return left == right
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, str) or isinstance(right, str):
        return isinstance(left, str) and isinstance(right, str) and left == right
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _json_equal(left_item, right_item)
            for left_item, right_item in zip(left, right, strict=True)
        )
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            _json_equal(left[key], right[key]) for key in left
        )
    return False


def evaluate_condition(
    payload: dict[str, Any],
    field_path: str,
    operator: ConditionOperator | str,
    comparison_value: Any | None,
) -> bool:
    try:
        selected_operator = ConditionOperator(operator)
    except ValueError as exc:
        raise ConditionEvaluationError("The configured condition operator is invalid.") from exc

    actual = resolve_dot_path(payload, field_path)
    if selected_operator is ConditionOperator.EXISTS:
        return actual is not _MISSING
    if selected_operator is ConditionOperator.DOES_NOT_EXIST:
        return actual is _MISSING
    if actual is _MISSING:
        return False
    if selected_operator is ConditionOperator.EQUALS:
        return _json_equal(actual, comparison_value)
    if selected_operator is ConditionOperator.NOT_EQUALS:
        return not _json_equal(actual, comparison_value)
    if selected_operator is ConditionOperator.CONTAINS:
        if isinstance(actual, str) and isinstance(comparison_value, str):
            return comparison_value in actual
        if isinstance(actual, list):
            return any(_json_equal(item, comparison_value) for item in actual)
        raise ConditionEvaluationError("The contains operator requires a string or array value.")
    if not _is_number(actual) or not _is_number(comparison_value):
        raise ConditionEvaluationError("Numeric conditions require numeric payload values.")
    if selected_operator is ConditionOperator.GREATER_THAN:
        return actual > comparison_value
    if selected_operator is ConditionOperator.GREATER_THAN_OR_EQUAL:
        return actual >= comparison_value
    if selected_operator is ConditionOperator.LESS_THAN:
        return actual < comparison_value
    return actual <= comparison_value
