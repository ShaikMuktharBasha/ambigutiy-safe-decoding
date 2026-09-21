"""EncoderService - builds a stable category <-> index <-> one-hot mapping."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.preprocessing import OneHotEncoder

from .errors import InvalidCategoriesError
from .probability import validate_categories

CategoryOrder = Literal["appearance", "alphabetical", "frequency"]


def clean_label(value: Any) -> str | None:
    """Canonical string form of a raw categorical cell (``None`` for nulls)."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text or None


@dataclass(frozen=True)
class CategoryEncoding:
    """Immutable mapping between category names, indices and one-hot vectors."""

    categories: tuple[str, ...]

    @property
    def size(self) -> int:
        return len(self.categories)

    @property
    def mapping(self) -> dict[str, int]:
        return {category: index for index, category in enumerate(self.categories)}

    def index_of(self, category: str) -> int:
        try:
            return self.mapping[category]
        except KeyError as exc:
            raise InvalidCategoriesError(f"Unknown category '{category}'.") from exc

    def one_hot(self, category: str) -> list[int]:
        vector = [0] * self.size
        vector[self.index_of(category)] = 1
        return vector

    def to_dict(self) -> dict[str, Any]:
        return {
            "categories": list(self.categories),
            "mapping": [
                {"category": c, "index": i, "one_hot": self.one_hot(c)}
                for i, c in enumerate(self.categories)
            ],
        }


class EncoderService:
    """Detects unique categories and produces one-hot vectors.

    Category order is part of the contract: probability vectors are only
    meaningful relative to a fixed index order, so the encoding is preserved
    alongside every dataset.
    """

    def __init__(self, order: CategoryOrder = "appearance", max_categories: int = 50) -> None:
        if order not in ("appearance", "alphabetical", "frequency"):
            raise ValueError(f"Unsupported category order '{order}'.")
        self.order = order
        self.max_categories = max_categories

    def fit(self, values: Iterable[Any]) -> CategoryEncoding:
        labels = [label for label in (clean_label(v) for v in values) if label is not None]
        if not labels:
            raise InvalidCategoriesError("The column contains no non-empty values to encode.")
        counts = Counter(labels)
        if self.order == "alphabetical":
            categories = sorted(counts, key=str.casefold)
        elif self.order == "frequency":
            first_seen = {label: i for i, label in reversed(list(enumerate(labels)))}
            categories = sorted(counts, key=lambda c: (-counts[c], first_seen[c]))
        else:
            categories = list(dict.fromkeys(labels))
        if len(categories) > self.max_categories:
            raise InvalidCategoriesError(
                f"The column has {len(categories)} unique values; the maximum for decoding is "
                f"{self.max_categories}. Choose a lower-cardinality categorical column.",
                details={"unique_values": len(categories), "max_categories": self.max_categories},
            )
        return CategoryEncoding(validate_categories(categories))

    def transform(self, values: Sequence[Any], encoding: CategoryEncoding) -> np.ndarray:
        """One-hot encode ``values``. Null or unknown values become all-zero rows."""
        labels = [clean_label(v) for v in values]
        column = np.array([[label if label is not None else ""] for label in labels], dtype=object)
        encoder = OneHotEncoder(
            categories=[list(encoding.categories)],
            handle_unknown="ignore",
            sparse_output=False,
            dtype=np.int8,
        )
        # Fitting on the explicit category list keeps the index order stable.
        encoder.fit(np.array([[c] for c in encoding.categories], dtype=object))
        return encoder.transform(column)

    def fit_transform(self, values: Sequence[Any]) -> tuple[CategoryEncoding, np.ndarray]:
        encoding = self.fit(values)
        return encoding, self.transform(values, encoding)

    @staticmethod
    def argmax_decode(matrix: np.ndarray, encoding: CategoryEncoding) -> list[str]:
        """The *naive* inverse transform: always returns a category via argmax."""
        indices = np.asarray(matrix).argmax(axis=1)
        return [encoding.categories[int(i)] for i in indices]
