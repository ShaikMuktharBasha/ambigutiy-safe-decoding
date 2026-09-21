"""RankerService - deterministic top-k ranking of probability vectors."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .types import MAX_TOP_K, RankedCategory


class RankerService:
    """Ranks categories by probability.

    Ties are broken by category index (a stable sort), so the ranking of an
    identical vector is always identical - important for reproducible audits.
    """

    @staticmethod
    def order(matrix: np.ndarray) -> np.ndarray:
        """Return, for each row, category indices sorted by probability (desc)."""
        return np.argsort(-np.asarray(matrix, dtype=np.float64), axis=1, kind="stable")

    def rank(
        self,
        probabilities: Sequence[float] | np.ndarray,
        categories: Sequence[str],
        top_k: int | None = None,
    ) -> list[RankedCategory]:
        vector = np.asarray(probabilities, dtype=np.float64)
        order = self.order(vector[None, :])[0]
        return self.rank_from_order(vector, order, categories, top_k)

    @staticmethod
    def rank_from_order(
        vector: np.ndarray,
        order: np.ndarray,
        categories: Sequence[str],
        top_k: int | None = None,
    ) -> list[RankedCategory]:
        limit = len(categories) if top_k is None else max(1, min(top_k, MAX_TOP_K, len(categories)))
        return [
            RankedCategory(
                rank=position + 1,
                category=categories[int(index)],
                index=int(index),
                probability=float(vector[int(index)]),
            )
            for position, index in enumerate(order[:limit])
        ]
