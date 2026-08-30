from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class Paginated[T](APIModel):
    items: list[T]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    pages: int = Field(ge=0)


class ErrorDetail(APIModel):
    code: str
    message: str
    request_id: str
    details: object | None = None


class ErrorResponse(APIModel):
    error: ErrorDetail
