from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .common import DecodeSettingsOverride, ModeLiteral, StatusLiteral


class RankedCategoryOut(BaseModel):
    rank: int
    category: str
    index: int
    probability: float


class DecodeRequest(DecodeSettingsOverride):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "categories": ["Electronics", "Furniture", "Clothing"],
                    "probabilities": [0.48, 0.47, 0.05],
                    "confidence_threshold": 0.75,
                    "near_tie_threshold": 0.05,
                    "mode": "strict",
                    "top_k": 3,
                }
            ]
        }
    )

    categories: list[str] = Field(..., min_length=2, max_length=500)
    probabilities: list[float] = Field(..., min_length=1, max_length=500)
    normalize: bool = Field(False, description="Rescale the vector to sum to 1 instead of rejecting it.")


class DecodeResponse(BaseModel):
    prediction: str | None
    argmax_prediction: str
    status: StatusLiteral
    confidence: float
    gap: float
    reason: str
    reason_code: str
    reason_label: str
    warning: str | None
    top_k: list[RankedCategoryOut]
    alternatives: list[RankedCategoryOut]
    top_1: str
    top_1_probability: float
    top_2: str | None
    top_2_probability: float | None
    threshold: float
    near_tie_threshold: float
    mode: ModeLiteral
    flags: list[str]
    tied_candidates: list[str]
    requires_review: bool
    probabilities: list[float]


class BatchDecodeRequest(DecodeSettingsOverride):
    categories: list[str] = Field(..., min_length=2, max_length=500)
    probabilities: list[list[float]] = Field(..., min_length=1, max_length=10_000)
    normalize: bool = False


class BatchDecodeResponse(BaseModel):
    total: int
    counts: dict[str, int]
    results: list[DecodeResponse]


class ArgmaxOut(BaseModel):
    prediction: str
    confidence: float


class CompareModesResponse(BaseModel):
    argmax: ArgmaxOut
    strict: DecodeResponse
    soft: DecodeResponse
    advisory: DecodeResponse
