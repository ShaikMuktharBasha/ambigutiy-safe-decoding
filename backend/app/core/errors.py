"""Domain errors raised by the decoding engine.

Every error carries a stable machine-readable ``code`` so that callers (the
FastAPI layer, a CLI, a notebook) can react to specific failure modes without
parsing messages.
"""

from __future__ import annotations

from typing import Any


class DecodingError(ValueError):
    """Base class for all decoding-engine errors."""

    code: str = "DECODING_ERROR"

    def __init__(self, message: str, *, details: Any | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class InvalidCategoriesError(DecodingError):
    code = "INVALID_CATEGORIES"


class InvalidThresholdError(DecodingError):
    code = "INVALID_THRESHOLD"


class MalformedProbabilityError(DecodingError):
    code = "MALFORMED_PROBABILITY_VECTOR"


class ProbabilityLengthError(DecodingError):
    code = "PROBABILITY_LENGTH_MISMATCH"


class NegativeProbabilityError(DecodingError):
    code = "NEGATIVE_PROBABILITY"


class ProbabilityRangeError(DecodingError):
    code = "PROBABILITY_OUT_OF_RANGE"


class ProbabilitySumError(DecodingError):
    code = "PROBABILITY_SUM_INVALID"
