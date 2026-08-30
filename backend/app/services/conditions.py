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
        return actual == comparison_value
    if selected_operator is ConditionOperator.NOT_EQUALS:
        return actual != comparison_value
    if selected_operator is ConditionOperator.CONTAINS:
        if isinstance(actual, str) and isinstance(comparison_value, str):
            return comparison_value in actual
        if isinstance(actual, list):
            return comparison_value in actual
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
