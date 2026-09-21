"""Value objects shared across the decoding engine.

These are plain dataclasses (no FastAPI / Pydantic) so the engine can be lifted
out into a standalone package without modification.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from .errors import InvalidThresholdError

MAX_TOP_K = 10

# Absolute tolerance used for every threshold comparison. Probabilities are
# floats, so ``0.50 - 0.45`` is ``0.04999999999999999``; without a tolerance a
# gap that is *exactly* on the near-tie threshold would be misclassified.
COMPARISON_EPSILON = 1e-9


class DecodingMode(str, Enum):
    STRICT = "strict"
    SOFT = "soft"
    ADVISORY = "advisory"


class DecodeStatus(str, Enum):
    SAFE = "SAFE"
    UNCERTAIN = "UNCERTAIN"
    AMBIGUOUS = "AMBIGUOUS"
    REJECTED = "REJECTED"
    MANUALLY_REVIEWED = "MANUALLY_REVIEWED"


class RiskFlag(str, Enum):
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    NEAR_TIE = "NEAR_TIE"
    EXACT_TIE = "EXACT_TIE"
    MULTI_WAY_TIE = "MULTI_WAY_TIE"


class ReasonCode(str, Enum):
    CONFIDENT = "CONFIDENT"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    NEAR_TIE = "NEAR_TIE"
    EXACT_TIE = "EXACT_TIE"
    MULTI_WAY_TIE = "MULTI_WAY_TIE"
    NEAR_TIE_LOW_CONFIDENCE = "NEAR_TIE_LOW_CONFIDENCE"


REASON_LABELS: dict[ReasonCode, str] = {
    ReasonCode.CONFIDENT: "Confident",
    ReasonCode.LOW_CONFIDENCE: "Low confidence",
    ReasonCode.NEAR_TIE: "Near tie",
    ReasonCode.EXACT_TIE: "Exact tie",
    ReasonCode.MULTI_WAY_TIE: "Multi-way tie",
    ReasonCode.NEAR_TIE_LOW_CONFIDENCE: "Near tie + low confidence",
}


@dataclass(frozen=True)
class DecodeConfig:
    """User-tunable parameters of the safe decoder."""

    confidence_threshold: float = 0.75
    near_tie_threshold: float = 0.05
    mode: DecodingMode = DecodingMode.STRICT
    top_k: int = 3

    def __post_init__(self) -> None:
        if not isinstance(self.mode, DecodingMode):
            try:
                object.__setattr__(self, "mode", DecodingMode(str(self.mode).lower()))
            except ValueError as exc:
                raise InvalidThresholdError(
                    f"Unknown decoding mode '{self.mode}'. Use strict, soft or advisory."
                ) from exc
        for name in ("confidence_threshold", "near_tie_threshold"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise InvalidThresholdError(f"{name} must be a number between 0 and 1.")
            if not 0.0 <= float(value) <= 1.0:
                raise InvalidThresholdError(
                    f"{name} must be between 0 and 1 (got {value}).",
                    details={"field": name, "value": value},
                )
            object.__setattr__(self, name, float(value))
        if isinstance(self.top_k, bool) or not isinstance(self.top_k, int):
            raise InvalidThresholdError("top_k must be an integer.")
        if not 1 <= self.top_k <= MAX_TOP_K:
            raise InvalidThresholdError(
                f"top_k must be between 1 and {MAX_TOP_K} (got {self.top_k}).",
                details={"field": "top_k", "value": self.top_k},
            )

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["mode"] = self.mode.value
        return data


@dataclass(frozen=True)
class RankedCategory:
    rank: int
    category: str
    index: int
    probability: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AmbiguityAssessment:
    """Mode-independent risk analysis of a single probability vector."""

    confidence: float
    top1: RankedCategory
    top2: RankedCategory | None
    gap: float
    confidence_threshold: float
    near_tie_threshold: float
    passes_confidence: bool
    passes_gap: bool
    flags: tuple[RiskFlag, ...]
    tied_candidates: tuple[str, ...]

    @property
    def is_safe(self) -> bool:
        return self.passes_confidence and self.passes_gap

    @property
    def is_near_tie(self) -> bool:
        return not self.passes_gap


@dataclass(frozen=True)
class DecodeResult:
    """Structured output of :class:`SafeDecoder`."""

    prediction: str | None
    argmax_prediction: str
    confidence: float
    status: DecodeStatus
    reason: str
    reason_code: ReasonCode
    reason_label: str
    warning: str | None
    top_k: tuple[RankedCategory, ...]
    gap: float
    top1: RankedCategory
    top2: RankedCategory | None
    threshold: float
    near_tie_threshold: float
    mode: DecodingMode
    flags: tuple[RiskFlag, ...]
    tied_candidates: tuple[str, ...]
    probabilities: tuple[float, ...] = field(repr=False)

    @property
    def requires_review(self) -> bool:
        return self.status is not DecodeStatus.SAFE

    @property
    def alternatives(self) -> tuple[RankedCategory, ...]:
        return self.top_k[1:]

    def to_dict(self) -> dict[str, Any]:
        return {
            "prediction": self.prediction,
            "argmax_prediction": self.argmax_prediction,
            "confidence": self.confidence,
            "status": self.status.value,
            "reason": self.reason,
            "reason_code": self.reason_code.value,
            "reason_label": self.reason_label,
            "warning": self.warning,
            "top_k": [r.to_dict() for r in self.top_k],
            "alternatives": [r.to_dict() for r in self.alternatives],
            "gap": self.gap,
            "top_1": self.top1.category,
            "top_1_probability": self.top1.probability,
            "top_2": self.top2.category if self.top2 else None,
            "top_2_probability": self.top2.probability if self.top2 else None,
            "threshold": self.threshold,
            "near_tie_threshold": self.near_tie_threshold,
            "mode": self.mode.value,
            "flags": [f.value for f in self.flags],
            "tied_candidates": list(self.tied_candidates),
            "requires_review": self.requires_review,
            "probabilities": list(self.probabilities),
        }
