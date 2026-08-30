from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.execution import Execution
    from app.models.user import User

JSONType = JSON().with_variant(JSONB(), "postgresql")


class Workflow(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflows"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    webhook_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    webhook_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped[User] = relationship(back_populates="workflows")
    condition: Mapped[WorkflowCondition | None] = relationship(
        back_populates="workflow", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )
    action: Mapped[WorkflowAction] = relationship(
        back_populates="workflow", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )
    executions: Mapped[list[Execution]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan", passive_deletes=True
    )


class WorkflowCondition(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "workflow_conditions"
    __table_args__ = (
        CheckConstraint(
            "operator IN ('equals','not_equals','contains','greater_than',"
            "'greater_than_or_equal','less_than','less_than_or_equal','exists',"
            "'does_not_exist')",
            name="ck_workflow_conditions_operator",
        ),
    )

    workflow_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    field_path: Mapped[str] = mapped_column(String(255), nullable=False)
    operator: Mapped[str] = mapped_column(String(32), nullable=False)
    comparison_value: Mapped[Any | None] = mapped_column(JSONType, nullable=True)

    workflow: Mapped[Workflow] = relationship(back_populates="condition")


class WorkflowAction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflow_actions"
    __table_args__ = (
        CheckConstraint(
            "action_type IN ('HTTP_POST','DISCORD_WEBHOOK')",
            name="ck_workflow_actions_type",
        ),
    )

    workflow_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    encrypted_config: Mapped[str] = mapped_column(Text, nullable=False)
    safe_display_config: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)

    workflow: Mapped[Workflow] = relationship(back_populates="action")
