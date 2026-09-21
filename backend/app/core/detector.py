"""AmbiguityDetector - the mode-independent safety analysis.

For every probability vector it computes:

* ``confidence``  = max(p)
* ``top1``/``top2`` = highest and second-highest categories
* ``gap``         = p(top1) - p(top2)
* whether the confidence and gap checks pass
* risk flags (low confidence, near tie, exact tie, multi-way tie)
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .probability import DEFAULT_SUM_TOLERANCE, validate_categories, validate_probabilities
from .ranker import RankerService
from .types import COMPARISON_EPSILON, AmbiguityAssessment, DecodeConfig, RankedCategory, RiskFlag


class AmbiguityDetector:
    def __init__(
        self,
        confidence_threshold: float = 0.75,
        near_tie_threshold: float = 0.05,
        *,
        ranker: RankerService | None = None,
    ) -> None:
        # Re-use DecodeConfig's validation so thresholds are checked in one place.
        config = DecodeConfig(
            confidence_threshold=confidence_threshold, near_tie_threshold=near_tie_threshold
        )
        self.confidence_threshold = config.confidence_threshold
        self.near_tie_threshold = config.near_tie_threshold
        self.ranker = ranker or RankerService()

    def assess(
        self,
        probabilities: Sequence[float] | np.ndarray,
        categories: Sequence[str],
        *,
        normalize: bool = False,
        tolerance: float = DEFAULT_SUM_TOLERANCE,
    ) -> AmbiguityAssessment:
        cats = validate_categories(categories)
        vector = validate_probabilities(probabilities, len(cats), normalize=normalize, tolerance=tolerance)
        return self.assess_matrix(vector[None, :], cats)[0]

    def assess_matrix(
        self,
        matrix: np.ndarray,
        categories: Sequence[str],
        order: np.ndarray | None = None,
    ) -> list[AmbiguityAssessment]:
        """Assess an already-validated ``(n_rows, n_categories)`` matrix."""
        probs = np.asarray(matrix, dtype=np.float64)
        if order is None:
            order = self.ranker.order(probs)
        rows = np.arange(probs.shape[0])
        p1 = probs[rows, order[:, 0]]
        p2 = probs[rows, order[:, 1]]
        gap = p1 - p2

        eps = COMPARISON_EPSILON
        passes_confidence = p1 + eps >= self.confidence_threshold
        exact_tie = gap <= eps
        # An exact tie can never be decoded safely, even with a near-tie threshold of 0.
        passes_gap = (gap + eps >= self.near_tie_threshold) & ~exact_tie
        within_window = probs + eps >= (p1 - self.near_tie_threshold)[:, None]

        assessments: list[AmbiguityAssessment] = []
        for i in range(probs.shape[0]):
            row_order = order[i]
            top1 = RankedCategory(1, categories[int(row_order[0])], int(row_order[0]), float(p1[i]))
            top2 = RankedCategory(2, categories[int(row_order[1])], int(row_order[1]), float(p2[i]))

            flags: list[RiskFlag] = []
            tied: tuple[str, ...] = ()
            if not passes_confidence[i]:
                flags.append(RiskFlag.LOW_CONFIDENCE)
            if not passes_gap[i]:
                flags.append(RiskFlag.NEAR_TIE)
                if exact_tie[i]:
                    flags.append(RiskFlag.EXACT_TIE)
                tied = tuple(
                    categories[int(idx)] for idx in row_order if within_window[i, int(idx)]
                )
                if len(tied) < 2:  # exact tie with threshold 0: window only holds equal values
                    tied = (top1.category, top2.category)
                if len(tied) >= 3:
                    flags.append(RiskFlag.MULTI_WAY_TIE)

            assessments.append(
                AmbiguityAssessment(
                    confidence=float(p1[i]),
                    top1=top1,
                    top2=top2,
                    gap=float(max(gap[i], 0.0)),
                    confidence_threshold=self.confidence_threshold,
                    near_tie_threshold=self.near_tie_threshold,
                    passes_confidence=bool(passes_confidence[i]),
                    passes_gap=bool(passes_gap[i]),
                    flags=tuple(flags),
                    tied_candidates=tied,
                )
            )
        return assessments
