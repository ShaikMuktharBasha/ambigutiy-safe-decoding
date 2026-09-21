"""Schemas for review, audit, settings, simulation, health and Gemini endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import DecodeSettings, DecodeSettingsOverride
from .decode import DecodeResponse
from .results import RowResult


# ------------------------------------------------------------------- review
class ReviewRequest(BaseModel):
    dataset_id: str
    row_id: int = Field(..., ge=1)
    action: Literal["accept", "choose", "reject", "revert"]
    category: str | None = Field(None, max_length=300)
    note: str | None = Field(None, max_length=500)


class BulkReviewRequest(BaseModel):
    dataset_id: str
    row_ids: list[int] = Field(..., min_length=1, max_length=5000)
    action: Literal["accept", "reject", "revert"]
    note: str | None = Field(None, max_length=500)


class AuditRecordOut(BaseModel):
    id: str
    timestamp: str
    dataset_id: str
    row_id: int
    column: str | None
    action: str
    original_value: str | None
    original_prediction: str | None
    decoder_prediction: str | None
    selected_category: str | None
    previous_status: str
    new_status: str
    confidence: float | None
    gap: float | None
    mode: str | None
    note: str | None


class ReviewResponse(BaseModel):
    row: RowResult
    audit: AuditRecordOut
    counts: dict[str, int]
    needs_review: int


class BulkReviewResponse(BaseModel):
    applied: int
    skipped: int
    audit: list[AuditRecordOut]
    counts: dict[str, int]
    needs_review: int


class AuditLogResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    total: int
    items: list[AuditRecordOut]


# ----------------------------------------------------------------- settings
class GeminiStatus(BaseModel):
    configured: bool
    model: str
    max_rows: int
    batch_size: int
    source: Literal["settings", "environment", "none"]
    key_preview: str | None
    model_is_custom: bool
    model_choices: list[str]


class Limits(BaseModel):
    max_upload_mb: float
    max_rows: int
    max_columns: int
    max_categories: int
    max_top_k: int
    probability_sum_tolerance: float


class SettingsOut(BaseModel):
    decode: DecodeSettings
    defaults: DecodeSettings
    gemini: GeminiStatus
    limits: Limits


class HealthOut(BaseModel):
    status: Literal["ok"]
    app: str
    version: str
    environment: str
    time: str
    gemini_configured: bool
    datasets: int


# --------------------------------------------------------------- simulation
class ExampleVectorRequest(BaseModel):
    categories: list[str] = Field(..., min_length=2, max_length=50)
    scenario: Literal["safe", "near_tie", "low_confidence", "random"] = "random"
    seed: int | None = Field(None, ge=0, le=2**31 - 1)


class ExampleVectorResponse(BaseModel):
    categories: list[str]
    probabilities: list[float]
    scenario: str
    seed: int


class NormalizeRequest(BaseModel):
    probabilities: list[float] = Field(..., min_length=2, max_length=500)


class NormalizeResponse(BaseModel):
    probabilities: list[float]
    original_sum: float


# ------------------------------------------------------------------- gemini
class GeminiConfigRequest(BaseModel):
    """Update the Gemini API key and/or model.

    A field left out of the request body is unchanged. Sending it as an empty
    string clears that field: an empty ``api_key`` reverts to the
    GEMINI_API_KEY environment variable (or leaves Gemini unconfigured if
    that is empty too), and an empty ``model`` reverts to GEMINI_MODEL /
    the built-in default.
    """

    api_key: str | None = Field(None, max_length=200)
    model: str | None = Field(None, max_length=100)


class GeminiClassifyRequest(DecodeSettingsOverride):
    text: str = Field(..., min_length=1, max_length=2000)
    categories: list[str] = Field(..., min_length=2, max_length=50)


class GeminiClassifyResponse(BaseModel):
    provider: Literal["gemini"] = "gemini"
    model: str
    text: str
    raw_scores: dict[str, float]
    probabilities: list[float]
    decode: DecodeResponse
