from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now
from app.models.workflow import JSONType

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class Execution(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "executions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','skipped')",
            name="ck_executions_status",
        ),
        CheckConstraint(
            "trigger_type IN ('webhook','test','manual_retry')",
            name="ck_executions_trigger_type",
        ),
        CheckConstraint("attempt_count >= 0", name="ck_executions_attempt_count"),
        CheckConstraint("max_attempts BETWEEN 1 AND 10", name="ck_executions_max_attempts"),
        Index("ix_executions_queue", "status", "next_attempt_at", "queued_at"),
        Index("ix_executions_workflow_created", "workflow_id", "created_at"),
    )

    workflow_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    retry_of_execution_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("executions.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False)
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    safe_result: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    workflow: Mapped[Workflow] = relationship(back_populates="executions", lazy="selectin")
    retry_of: Mapped[Execution | None] = relationship(remote_side="Execution.id")
