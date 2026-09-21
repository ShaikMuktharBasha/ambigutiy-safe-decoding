from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .common import DecodeSettings

CategoryOrderLiteral = Literal["appearance", "alphabetical", "frequency"]
ScenarioLiteral = Literal["confident", "moderate", "near_tie", "low_confidence", "overconfident_error"]


class ValueCount(BaseModel):
    value: str
    count: int


class ColumnProfile(BaseModel):
    name: str
    dtype: Literal["text", "integer", "float", "boolean", "datetime"]
    non_null: int
    null_count: int
    unique_count: int
    unique_ratio: float
    is_categorical: bool
    categorical_reason: str
    sample_values: list[str]
    top_values: list[ValueCount]


class EncodingEntry(BaseModel):
    category: str
    index: int
    one_hot: list[int]
    count: int


class OneHotPreviewRow(BaseModel):
    row_id: int
    value: str | None
    one_hot: list[int]


class EncodingOut(BaseModel):
    dataset_id: str | None
    column: str | None
    order: CategoryOrderLiteral
    categories: list[str]
    mapping: list[EncodingEntry]
    unencoded_rows: int
    vectors_preview: list[OneHotPreviewRow]


class PipelineState(BaseModel):
    stage: Literal["uploaded", "column_selected", "probabilities_ready", "decoded"]
    has_encoding: bool
    has_probabilities: bool
    has_results: bool
    probability_source: str | None
    probability_meta: dict[str, Any]
    decode_config: DecodeSettings | None
    decoded_at: str | None
    reviewed_rows: int
    audit_records: int


class DatasetSummary(BaseModel):
    id: str
    name: str
    source: Literal["upload", "demo"]
    filename: str | None
    created_at: str
    updated_at: str
    row_count: int
    column_count: int
    target_column: str | None
    category_count: int
    pipeline: PipelineState


class DatasetDetail(DatasetSummary):
    columns: list[ColumnProfile]
    suggested_column: str | None
    categorical_columns: list[str]
    text_columns: list[str]
    numeric_columns: list[str]
    preview: list[dict[str, Any]]
    encoding: EncodingOut | None
    suggested_probability_columns: dict[str, str]


class DemoRequest(BaseModel):
    rows: int = Field(300, ge=20, le=5000)
    seed: int | None = Field(42, ge=0, le=2**31 - 1)
    run_pipeline: bool = Field(True, description="Select product_type, simulate vectors and decode.")


class EncodeRequest(BaseModel):
    dataset_id: str | None = None
    column: str | None = Field(None, max_length=300)
    values: list[Any] | None = Field(None, max_length=100_000)
    order: CategoryOrderLiteral = "appearance"

    @model_validator(mode="after")
    def _check_source(self) -> EncodeRequest:
        if self.dataset_id is not None:
            if not self.column:
                raise ValueError("column is required when dataset_id is provided")
        elif self.values is None:
            raise ValueError("provide either dataset_id + column, or values")
        return self


class SimulateDatasetRequest(BaseModel):
    seed: int | None = Field(None, ge=0, le=2**31 - 1)
    mix: dict[ScenarioLiteral, float] | None = None

    @field_validator("mix")
    @classmethod
    def _check_mix(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        if value is None:
            return value
        if any(v < 0 or v > 1000 for v in value.values()):
            raise ValueError("scenario weights must be between 0 and 1000")
        if sum(value.values()) <= 0:
            raise ValueError("at least one scenario weight must be positive")
        return value


class ProbabilityColumnsRequest(BaseModel):
    mapping: dict[str, str] = Field(..., min_length=1, max_length=500)
    normalize: bool = False


class GeminiDatasetRequest(BaseModel):
    text_column: str = Field(..., min_length=1, max_length=300)
    max_rows: int | None = Field(None, ge=1, le=1000)
