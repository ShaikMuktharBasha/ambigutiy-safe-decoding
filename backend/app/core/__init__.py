"""Ambiguity-safe inverse decoding engine.

This package has no web-framework dependencies (only NumPy, pandas and
scikit-learn) so it can be published as a standalone library::

    from app.core import SafeDecoder, DecodeConfig

    decoder = SafeDecoder(DecodeConfig(confidence_threshold=0.75, near_tie_threshold=0.05))
    result = decoder.decode([0.48, 0.47, 0.05], ["Electronics", "Furniture", "Clothing"])
    result.status   # DecodeStatus.AMBIGUOUS
"""

from .decoder import SafeDecoder
from .detector import AmbiguityDetector
from .encoder import CategoryEncoding, EncoderService, clean_label
from .errors import (
    DecodingError,
    InvalidCategoriesError,
    InvalidThresholdError,
    MalformedProbabilityError,
    NegativeProbabilityError,
    ProbabilityLengthError,
    ProbabilityRangeError,
    ProbabilitySumError,
)
from .probability import normalize_vector, validate_categories, validate_matrix, validate_probabilities
from .ranker import RankerService
from .types import (
    MAX_TOP_K,
    AmbiguityAssessment,
    DecodeConfig,
    DecodeResult,
    DecodeStatus,
    DecodingMode,
    RankedCategory,
    ReasonCode,
    RiskFlag,
)

__all__ = [
    "MAX_TOP_K",
    "AmbiguityAssessment",
    "AmbiguityDetector",
    "CategoryEncoding",
    "DecodeConfig",
    "DecodeResult",
    "DecodeStatus",
    "DecodingError",
    "DecodingMode",
    "EncoderService",
    "InvalidCategoriesError",
    "InvalidThresholdError",
    "MalformedProbabilityError",
    "NegativeProbabilityError",
    "ProbabilityLengthError",
    "ProbabilityRangeError",
    "ProbabilitySumError",
    "RankedCategory",
    "RankerService",
    "ReasonCode",
    "RiskFlag",
    "SafeDecoder",
    "clean_label",
    "normalize_vector",
    "validate_categories",
    "validate_matrix",
    "validate_probabilities",
]
