"""Validation and normalisation of categories and probability vectors."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

import numpy as np

from .errors import (
    InvalidCategoriesError,
    MalformedProbabilityError,
    NegativeProbabilityError,
    ProbabilityLengthError,
    ProbabilityRangeError,
    ProbabilitySumError,
)

DEFAULT_SUM_TOLERANCE = 1e-3
_RANGE_EPSILON = 1e-9


def validate_categories(categories: Sequence[Any]) -> tuple[str, ...]:
    """Return categories as a tuple of non-empty, unique strings."""
    if categories is None or isinstance(categories, (str, bytes)):
        raise InvalidCategoriesError("Categories must be a list of category names.")
    cleaned: list[str] = []
    for position, raw in enumerate(categories):
        if raw is None:
            raise InvalidCategoriesError(f"Category at position {position} is missing.")
        name = str(raw).strip()
        if not name:
            raise InvalidCategoriesError(f"Category at position {position} is empty.")
        cleaned.append(name)
    if len(cleaned) < 2:
        raise InvalidCategoriesError("At least two categories are required for decoding.")
    seen: set[str] = set()
    repeated: set[str] = set()
    for name in cleaned:
        if name in seen:
            repeated.add(name)
        seen.add(name)
    duplicates = sorted(repeated)
    if duplicates:
        raise InvalidCategoriesError(
            f"Duplicate categories are not allowed: {', '.join(duplicates)}.",
            details={"duplicates": duplicates},
        )
    return tuple(cleaned)


def normalize_vector(values: Sequence[float] | np.ndarray) -> np.ndarray:
    """Scale a non-negative vector so that it sums to exactly 1."""
    vector = _to_float_array(values, row=None)
    _check_negative(vector, row=None)
    total = float(vector.sum())
    if total <= 0.0:
        raise ProbabilitySumError("Cannot normalise a vector whose values sum to zero.")
    return vector / total


def validate_probabilities(
    values: Sequence[float] | np.ndarray,
    n_categories: int | None = None,
    *,
    normalize: bool = False,
    tolerance: float = DEFAULT_SUM_TOLERANCE,
) -> np.ndarray:
    """Validate a single probability vector and return it as ``float64``.

    Rules:
      * every element must be a finite number;
      * no element may be negative or greater than 1;
      * the length must match the number of categories (when given);
      * the vector must sum to 1 within ``tolerance`` - unless ``normalize`` is
        set, in which case it is rescaled to sum to 1.
    """
    matrix = validate_matrix(
        [values] if not isinstance(values, np.ndarray) or values.ndim == 1 else values,
        n_categories,
        normalize=normalize,
        tolerance=tolerance,
        _single=True,
    )
    return matrix[0]


def validate_matrix(
    rows: Sequence[Sequence[float]] | np.ndarray,
    n_categories: int | None = None,
    *,
    normalize: bool = False,
    tolerance: float = DEFAULT_SUM_TOLERANCE,
    _single: bool = False,
) -> np.ndarray:
    """Validate an ``(n_rows, n_categories)`` probability matrix.

    Errors reference the offending (1-based) row so they can be surfaced to a
    user reviewing an uploaded file.
    """
    if isinstance(rows, np.ndarray):
        if rows.ndim != 2:
            raise MalformedProbabilityError("Probability matrix must be two-dimensional.")
        raw_rows: list[Any] = list(rows)
    else:
        if rows is None or isinstance(rows, (str, bytes)):
            raise MalformedProbabilityError("Probabilities must be a list of numbers.")
        raw_rows = list(rows)
    if not raw_rows:
        raise MalformedProbabilityError("No probability vectors were provided.")

    arrays: list[np.ndarray] = []
    for i, row in enumerate(raw_rows):
        label = None if _single else i + 1
        vector = _to_float_array(row, row=label)
        if n_categories is not None and vector.shape[0] != n_categories:
            raise ProbabilityLengthError(
                f"{_prefix(label)}Probability vector has {vector.shape[0]} values "
                f"but there are {n_categories} categories.",
                details={"row": label, "expected": n_categories, "received": int(vector.shape[0])},
            )
        if vector.shape[0] < 2:
            raise ProbabilityLengthError(
                f"{_prefix(label)}A probability vector needs at least two values.",
                details={"row": label},
            )
        arrays.append(vector)

    lengths = {a.shape[0] for a in arrays}
    if len(lengths) > 1:
        raise ProbabilityLengthError(
            "All probability vectors must have the same length.",
            details={"lengths": sorted(lengths)},
        )

    matrix = np.vstack(arrays)
    for i, vector in enumerate(matrix):
        label = None if _single else i + 1
        _check_negative(vector, row=label)
        if np.any(vector > 1.0 + _RANGE_EPSILON):
            position = int(np.argmax(vector > 1.0 + _RANGE_EPSILON))
            raise ProbabilityRangeError(
                f"{_prefix(label)}Probability at position {position + 1} is {vector[position]:g}; "
                "probabilities cannot exceed 1.",
                details={"row": label, "position": position + 1, "value": float(vector[position])},
            )

    sums = matrix.sum(axis=1)
    if normalize:
        zero_rows = np.where(sums <= 0.0)[0]
        if zero_rows.size:
            label = None if _single else int(zero_rows[0]) + 1
            raise ProbabilitySumError(
                f"{_prefix(label)}Cannot normalise a vector whose values sum to zero.",
                details={"row": label},
            )
        return np.clip(matrix / sums[:, None], 0.0, 1.0)

    bad = np.where(np.abs(sums - 1.0) > tolerance)[0]
    if bad.size:
        index = int(bad[0])
        label = None if _single else index + 1
        raise ProbabilitySumError(
            f"{_prefix(label)}Probabilities sum to {sums[index]:.6g}, not 1 "
            f"(tolerance ±{tolerance:g}). Enable normalisation to rescale them.",
            details={"row": label, "sum": float(sums[index]), "tolerance": tolerance},
        )
    return np.clip(matrix, 0.0, 1.0)


def _to_float_array(values: Any, row: int | None) -> np.ndarray:
    if values is None or isinstance(values, (str, bytes, dict)):
        raise MalformedProbabilityError(
            f"{_prefix(row)}Probability vector must be a list of numbers.", details={"row": row}
        )
    try:
        items = list(values)
    except TypeError as exc:
        raise MalformedProbabilityError(
            f"{_prefix(row)}Probability vector must be a list of numbers.", details={"row": row}
        ) from exc
    parsed: list[float] = []
    for position, item in enumerate(items):
        if isinstance(item, bool) or item is None:
            raise MalformedProbabilityError(
                f"{_prefix(row)}Value at position {position + 1} is not a number.",
                details={"row": row, "position": position + 1},
            )
        try:
            number = float(item)
        except (TypeError, ValueError) as exc:
            raise MalformedProbabilityError(
                f"{_prefix(row)}Value at position {position + 1} ('{item}') is not a number.",
                details={"row": row, "position": position + 1},
            ) from exc
        if not math.isfinite(number):
            raise MalformedProbabilityError(
                f"{_prefix(row)}Value at position {position + 1} is not a finite number.",
                details={"row": row, "position": position + 1},
            )
        parsed.append(number)
    return np.asarray(parsed, dtype=np.float64)


def _check_negative(vector: np.ndarray, row: int | None) -> None:
    if np.any(vector < 0.0):
        position = int(np.argmax(vector < 0.0))
        raise NegativeProbabilityError(
            f"{_prefix(row)}Probability at position {position + 1} is negative ({vector[position]:g}).",
            details={"row": row, "position": position + 1, "value": float(vector[position])},
        )


def _prefix(row: int | None) -> str:
    return f"Row {row}: " if row is not None else ""
