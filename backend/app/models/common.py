from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ModeLiteral = Literal["strict", "soft", "advisory"]
StatusLiteral = Literal["SAFE", "UNCERTAIN", "AMBIGUOUS", "REJECTED", "MANUALLY_REVIEWED"]


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class DecodeSettings(BaseModel):
    confidence_threshold: float = Field(0.75, ge=0.0, le=1.0, description="Minimum max-probability to accept.")
    near_tie_threshold: float = Field(0.05, ge=0.0, le=1.0, description="Minimum top-1 minus top-2 gap.")
    mode: ModeLiteral = "strict"
    top_k: int = Field(3, ge=1, le=10)


class DecodeSettingsOverride(BaseModel):
    """Optional per-request overrides; omitted fields use the saved settings."""

    confidence_threshold: float | None = Field(None, ge=0.0, le=1.0)
    near_tie_threshold: float | None = Field(None, ge=0.0, le=1.0)
    mode: ModeLiteral | None = None
    top_k: int | None = Field(None, ge=1, le=10)
