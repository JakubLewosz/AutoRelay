from enum import StrEnum


class ConditionOperator(StrEnum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    GREATER_THAN = "greater_than"
    GREATER_THAN_OR_EQUAL = "greater_than_or_equal"
    LESS_THAN = "less_than"
    LESS_THAN_OR_EQUAL = "less_than_or_equal"
    EXISTS = "exists"
    DOES_NOT_EXIST = "does_not_exist"


class ActionType(StrEnum):
    HTTP_POST = "HTTP_POST"
    DISCORD_WEBHOOK = "DISCORD_WEBHOOK"


class ExecutionStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class TriggerType(StrEnum):
    WEBHOOK = "webhook"
    TEST = "test"
    MANUAL_RETRY = "manual_retry"
