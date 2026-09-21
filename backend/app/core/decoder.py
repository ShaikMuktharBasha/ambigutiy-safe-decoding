"""SafeDecoder - replaces blind argmax with an ambiguity-aware decision.

Pipeline for every vector::

    validate -> rank -> confidence check -> near-tie check -> mode policy

Mode policy (``assessment`` is the mode-independent analysis):

=========  =======================  ===================================  ==========
Mode       Checks pass              Near tie (any confidence)            Low confidence only
=========  =======================  ===================================  ==========
strict     SAFE, prediction=top1    AMBIGUOUS, prediction=None           REJECTED, prediction=None
soft       SAFE, prediction=top1    UNCERTAIN, prediction=top1           UNCERTAIN, prediction=top1
advisory   SAFE, prediction=top1    AMBIGUOUS, prediction=top1 + warning UNCERTAIN, prediction=top1 + warning
=========  =======================  ===================================  ==========
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .detector import AmbiguityDetector
from .probability import DEFAULT_SUM_TOLERANCE, validate_categories, validate_matrix
from .ranker import RankerService
from .types import (
    REASON_LABELS,
    AmbiguityAssessment,
    DecodeConfig,
    DecodeResult,
    DecodeStatus,
    DecodingMode,
    ReasonCode,
    RiskFlag,
)


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def reason_code_for(assessment: AmbiguityAssessment) -> ReasonCode:
    if assessment.is_safe:
        return ReasonCode.CONFIDENT
    flags = set(assessment.flags)
    if RiskFlag.NEAR_TIE in flags:
        if RiskFlag.MULTI_WAY_TIE in flags:
            return ReasonCode.MULTI_WAY_TIE
        if RiskFlag.EXACT_TIE in flags:
            return ReasonCode.EXACT_TIE
        if RiskFlag.LOW_CONFIDENCE in flags:
            return ReasonCode.NEAR_TIE_LOW_CONFIDENCE
        return ReasonCode.NEAR_TIE
    return ReasonCode.LOW_CONFIDENCE


def explain(assessment: AmbiguityAssessment, code: ReasonCode) -> str:
    """Human-readable explanation of the decision."""
    a = assessment
    t1, t2 = a.top1, a.top2
    low_conf_clause = (
        f" Confidence {_pct(a.confidence)} is also below the {_pct(a.confidence_threshold)} threshold."
        if RiskFlag.LOW_CONFIDENCE in a.flags
        else ""
    )
    if code is ReasonCode.CONFIDENT:
        runner_up = f" and leads {t2.category} by {_pct(a.gap)}" if t2 else ""
        return (
            f"Confidence {_pct(a.confidence)} meets the {_pct(a.confidence_threshold)} threshold"
            f"{runner_up}."
        )
    if code is ReasonCode.MULTI_WAY_TIE:
        names = ", ".join(a.tied_candidates[:-1]) + f" and {a.tied_candidates[-1]}"
        return (
            f"{len(a.tied_candidates)}-way near tie: {names} are all within "
            f"{_pct(a.near_tie_threshold)} of the top probability.{low_conf_clause}"
        )
    if code is ReasonCode.EXACT_TIE and t2 is not None:
        return (
            f"Exact tie: {t1.category} and {t2.category} both have {_pct(t1.probability)}."
            f"{low_conf_clause}"
        )
    if code in (ReasonCode.NEAR_TIE, ReasonCode.NEAR_TIE_LOW_CONFIDENCE) and t2 is not None:
        return (
            f"Top two categories are too close: {t1.category} {_pct(t1.probability)} vs "
            f"{t2.category} {_pct(t2.probability)} (gap {_pct(a.gap)} is below the "
            f"{_pct(a.near_tie_threshold)} near-tie threshold).{low_conf_clause}"
        )
    return f"Confidence {_pct(a.confidence)} is below the {_pct(a.confidence_threshold)} threshold."


def warning_for(assessment: AmbiguityAssessment) -> str:
    parts: list[str] = []
    if RiskFlag.LOW_CONFIDENCE in assessment.flags:
        parts.append("Low confidence")
    if RiskFlag.MULTI_WAY_TIE in assessment.flags:
        parts.append("Multi-way tie")
    elif RiskFlag.EXACT_TIE in assessment.flags:
        parts.append("Exact tie")
    elif RiskFlag.NEAR_TIE in assessment.flags:
        parts.append("Near tie")
    return " / ".join(parts)


def apply_mode(assessment: AmbiguityAssessment, mode: DecodingMode) -> tuple[DecodeStatus, str | None]:
    """Map a risk assessment to ``(status, prediction)`` for the chosen mode."""
    top1 = assessment.top1.category
    if assessment.is_safe:
        return DecodeStatus.SAFE, top1
    if mode is DecodingMode.STRICT:
        status = DecodeStatus.AMBIGUOUS if assessment.is_near_tie else DecodeStatus.REJECTED
        return status, None
    if mode is DecodingMode.SOFT:
        return DecodeStatus.UNCERTAIN, top1
    status = DecodeStatus.AMBIGUOUS if assessment.is_near_tie else DecodeStatus.UNCERTAIN
    return status, top1


class SafeDecoder:
    """Ambiguity-safe inverse decoder for one-hot / probability vectors."""

    def __init__(
        self,
        config: DecodeConfig | None = None,
        *,
        ranker: RankerService | None = None,
        sum_tolerance: float = DEFAULT_SUM_TOLERANCE,
    ) -> None:
        self.config = config or DecodeConfig()
        self.ranker = ranker or RankerService()
        self.detector = AmbiguityDetector(
            self.config.confidence_threshold, self.config.near_tie_threshold, ranker=self.ranker
        )
        self.sum_tolerance = sum_tolerance

    def decode(
        self,
        probabilities: Sequence[float] | np.ndarray,
        categories: Sequence[str],
        *,
        normalize: bool = False,
    ) -> DecodeResult:
        return self.decode_batch([probabilities], categories, normalize=normalize, _single=True)[0]

    def decode_batch(
        self,
        matrix: Sequence[Sequence[float]] | np.ndarray,
        categories: Sequence[str],
        *,
        normalize: bool = False,
        _single: bool = False,
    ) -> list[DecodeResult]:
        cats = validate_categories(categories)
        probs = validate_matrix(
            matrix, len(cats), normalize=normalize, tolerance=self.sum_tolerance, _single=_single
        )
        return self.decode_validated(probs, cats)

    def decode_validated(self, probs: np.ndarray, categories: Sequence[str]) -> list[DecodeResult]:
        """Decode a matrix that has already passed :func:`validate_matrix`."""
        order = self.ranker.order(probs)
        assessments = self.detector.assess_matrix(probs, categories, order=order)
        mode = self.config.mode
        results: list[DecodeResult] = []
        for i, assessment in enumerate(assessments):
            status, prediction = apply_mode(assessment, mode)
            code = reason_code_for(assessment)
            warning = None
            if not assessment.is_safe and mode is not DecodingMode.STRICT:
                warning = warning_for(assessment)
            results.append(
                DecodeResult(
                    prediction=prediction,
                    argmax_prediction=assessment.top1.category,
                    confidence=assessment.confidence,
                    status=status,
                    reason=explain(assessment, code),
                    reason_code=code,
                    reason_label=REASON_LABELS[code],
                    warning=warning,
                    top_k=tuple(
                        self.ranker.rank_from_order(probs[i], order[i], categories, self.config.top_k)
                    ),
                    gap=assessment.gap,
                    top1=assessment.top1,
                    top2=assessment.top2,
                    threshold=self.config.confidence_threshold,
                    near_tie_threshold=self.config.near_tie_threshold,
                    mode=mode,
                    flags=assessment.flags,
                    tied_candidates=assessment.tied_candidates,
                    probabilities=tuple(float(p) for p in probs[i]),
                )
            )
        return results

    @staticmethod
    def argmax(probabilities: Sequence[float] | np.ndarray, categories: Sequence[str]) -> str:
        """Standard (unsafe) decoding, provided for comparison."""
        return categories[int(np.argmax(np.asarray(probabilities, dtype=np.float64)))]
