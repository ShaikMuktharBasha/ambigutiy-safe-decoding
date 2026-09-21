from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from .common import DecodeSettings, StatusLiteral
from .decode import RankedCategoryOut


class ReviewInfo(BaseModel):
    row_id: int
    action: str
    selected_category: str | None
    previous_status: str
    original_prediction: str | None
    timestamp: str
    note: str | None


class ProbabilityEntry(BaseModel):
    category: str
    index: int
    probability: float


class RowResult(BaseModel):
    row_id: int
    original_value: str | None
    prediction: str | None
    final_value: str | None
    argmax_prediction: str
    status: StatusLiteral
    computed_status: StatusLiteral
    confidence: float
    gap: float
    top_1: str
    top_1_probability: float
    top_2: str | None
    top_2_probability: float | None
    reason: str
    reason_code: str
    reason_label: str
    warning: str | None
    flags: list[str]
    tied_candidates: list[str]
    top_k: list[RankedCategoryOut]
    probabilities: list[ProbabilityEntry]
    requires_review: bool
    manually_reviewed: bool
    review: ReviewInfo | None
    argmax_correct: bool | None
    probability_source: str | None
    scenario: str | None
    context: dict[str, Any]


class ResultsPage(BaseModel):
    dataset_id: str
    target_column: str | None
    categories: list[str]
    config: DecodeSettings
    decoded_at: str | None
    items: list[RowResult]
    total: int
    page: int
    page_size: int
    pages: int
    counts: dict[str, int]


class HistogramBin(BaseModel):
    start: float
    end: float
    label: str
    count: int
    below_threshold: bool


class CategoryCount(BaseModel):
    category: str
    count: int
    argmax_count: int


class ResultsSummary(BaseModel):
    dataset_id: str
    dataset_name: str
    decoded: bool
    total_rows: int
    target_column: str | None
    categories: list[str]
    config: DecodeSettings | None
    decoded_at: str | None
    counts: dict[str, int]
    computed_counts: dict[str, int]
    needs_review: int
    reviewed: int
    average_confidence: float | None
    median_confidence: float | None
    average_gap: float | None
    confidence_histogram: list[HistogramBin]
    category_counts: list[CategoryCount]
    unresolved: int
    reason_counts: dict[str, int]
    probability_source: str | None
    recent: list[RowResult]


class ArgmaxMetrics(BaseModel):
    total: int
    accepted: int
    abstained: int
    flagged: int
    correct: int
    incorrect: int
    accuracy: float | None
    silent_errors: int
    average_confidence: float | None


class SafeMetrics(BaseModel):
    total: int
    accepted: int
    flagged: int
    abstained: int
    status_counts: dict[str, int]
    correct_accepted: int
    incorrect_accepted: int
    coverage: float | None
    selective_accuracy: float | None
    errors_intercepted: int
    correct_flagged: int
    review_rate: float | None
    average_confidence_accepted: float | None


class ComparisonMetrics(BaseModel):
    unsafe_predictions_prevented: int
    errors_let_through: int
    error_reduction: float | None
    accuracy_gain: float | None


class ReviewMetrics(BaseModel):
    reviewed: int
    reviewed_correct: int
    reviewed_rejected: int
    human_accuracy: float | None


class SweepPoint(BaseModel):
    confidence_threshold: float
    coverage: float
    selective_accuracy: float | None
    errors_let_through: int
    errors_intercepted: int
    is_current: bool


class ScenarioBreakdown(BaseModel):
    scenario: str
    total: int
    argmax_accuracy: float | None
    status_counts: dict[str, int]


class EvaluationOut(BaseModel):
    dataset_id: str
    has_ground_truth: bool
    evaluated_rows: int
    config: DecodeSettings
    probability_source: str | None
    argmax: ArgmaxMetrics
    safe: SafeMetrics
    comparison: ComparisonMetrics
    review: ReviewMetrics
    sweep: list[SweepPoint]
    scenarios: list[ScenarioBreakdown]
    notes: list[str]
