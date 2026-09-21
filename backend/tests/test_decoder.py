"""Tests for the core ambiguity-safe decoding engine."""

from __future__ import annotations

import numpy as np
import pytest

from app.core import (
    AmbiguityDetector,
    DecodeConfig,
    DecodeStatus,
    DecodingMode,
    InvalidCategoriesError,
    InvalidThresholdError,
    MalformedProbabilityError,
    NegativeProbabilityError,
    ProbabilityLengthError,
    ProbabilityRangeError,
    ProbabilitySumError,
    RankerService,
    ReasonCode,
    RiskFlag,
    SafeDecoder,
    normalize_vector,
    validate_probabilities,
)

CATS = ["Electronics", "Furniture", "Clothing"]


def decode(vector, mode="strict", **kwargs):
    return SafeDecoder(DecodeConfig(mode=DecodingMode(mode), **kwargs)).decode(vector, CATS)


# ------------------------------------------------------------------ core cases
def test_high_confidence_prediction_is_safe():
    result = decode([0.91, 0.06, 0.03])
    assert result.status is DecodeStatus.SAFE
    assert result.prediction == "Electronics"
    assert result.confidence == pytest.approx(0.91)
    assert result.gap == pytest.approx(0.85)
    assert result.reason_code is ReasonCode.CONFIDENT
    assert result.flags == ()
    assert not result.requires_review


def test_near_tie_is_ambiguous_with_one_point_gap():
    result = decode([0.48, 0.47, 0.05])
    assert result.status is DecodeStatus.AMBIGUOUS
    assert result.prediction is None
    assert result.gap == pytest.approx(0.01)
    assert result.top1.category == "Electronics"
    assert result.top2 is not None and result.top2.category == "Furniture"
    assert RiskFlag.NEAR_TIE in result.flags
    assert "too close" in result.reason


def test_near_tie_with_high_confidence_threshold_disabled():
    # Confidence passes (threshold 0.3) but the gap does not -> still ambiguous.
    result = decode([0.40, 0.38, 0.22], confidence_threshold=0.3)
    assert result.status is DecodeStatus.AMBIGUOUS
    assert result.reason_code is ReasonCode.NEAR_TIE
    assert RiskFlag.LOW_CONFIDENCE not in result.flags


def test_low_confidence_three_way_is_ambiguous():
    result = decode([0.34, 0.33, 0.33])
    assert result.status is DecodeStatus.AMBIGUOUS
    assert result.prediction is None
    assert RiskFlag.MULTI_WAY_TIE in result.flags
    assert RiskFlag.LOW_CONFIDENCE in result.flags
    assert set(result.tied_candidates) == set(CATS)


def test_low_confidence_with_clear_gap_is_rejected_in_strict_mode():
    result = decode([0.60, 0.30, 0.10])
    assert result.status is DecodeStatus.REJECTED
    assert result.prediction is None
    assert result.reason_code is ReasonCode.LOW_CONFIDENCE
    assert result.flags == (RiskFlag.LOW_CONFIDENCE,)


def test_exact_tie_is_never_safe_even_with_zero_tie_threshold():
    result = decode([0.5, 0.5, 0.0], confidence_threshold=0.3, near_tie_threshold=0.0)
    assert result.status is DecodeStatus.AMBIGUOUS
    assert RiskFlag.EXACT_TIE in result.flags
    assert result.gap == 0
    # Stable ranking: ties are broken by category index.
    assert result.top1.category == "Electronics"


def test_exact_three_way_tie():
    result = decode([1 / 3, 1 / 3, 1 / 3])
    assert result.status is DecodeStatus.AMBIGUOUS
    assert RiskFlag.EXACT_TIE in result.flags
    assert RiskFlag.MULTI_WAY_TIE in result.flags
    assert result.reason_code is ReasonCode.MULTI_WAY_TIE


# ------------------------------------------------------------------ boundaries
def test_confidence_exactly_at_threshold_is_accepted():
    assert decode([0.75, 0.20, 0.05]).status is DecodeStatus.SAFE


def test_confidence_just_below_threshold_is_not_accepted():
    assert decode([0.7499, 0.2001, 0.05]).status is DecodeStatus.REJECTED


def test_gap_exactly_at_near_tie_threshold_passes_despite_float_error():
    # 0.50 - 0.45 == 0.04999999999999999 in IEEE-754.
    result = decode([0.50, 0.45, 0.05], confidence_threshold=0.5)
    assert result.status is DecodeStatus.SAFE


def test_gap_just_below_near_tie_threshold_fails():
    result = decode([0.50, 0.4501, 0.0499], confidence_threshold=0.5)
    assert result.status is DecodeStatus.AMBIGUOUS


# ---------------------------------------------------------------------- modes
def test_strict_mode_abstains():
    for vector in ([0.48, 0.47, 0.05], [0.6, 0.3, 0.1]):
        result = decode(vector, "strict")
        assert result.prediction is None
        assert result.warning is None
        assert result.requires_review


def test_soft_mode_returns_top_prediction_marked_uncertain():
    result = decode([0.48, 0.47, 0.05], "soft")
    assert result.status is DecodeStatus.UNCERTAIN
    assert result.prediction == "Electronics"
    assert result.confidence == pytest.approx(0.48)
    assert [r.category for r in result.alternatives] == ["Furniture", "Clothing"]
    assert result.warning == "Low confidence / Near tie"


def test_soft_mode_keeps_safe_rows_safe():
    assert decode([0.91, 0.06, 0.03], "soft").status is DecodeStatus.SAFE


def test_advisory_mode_always_returns_prediction_with_warning():
    tie = decode([0.48, 0.47, 0.05], "advisory")
    assert tie.prediction == "Electronics"
    assert tie.status is DecodeStatus.AMBIGUOUS
    assert tie.warning and "Near tie" in tie.warning

    low = decode([0.6, 0.3, 0.1], "advisory")
    assert low.prediction == "Electronics"
    assert low.status is DecodeStatus.UNCERTAIN
    assert low.warning == "Low confidence"

    safe = decode([0.91, 0.06, 0.03], "advisory")
    assert safe.status is DecodeStatus.SAFE and safe.warning is None


def test_modes_share_the_same_assessment():
    vector = [0.44, 0.41, 0.15]
    results = {m: decode(vector, m) for m in ("strict", "soft", "advisory")}
    assert all(r.gap == pytest.approx(0.03) for r in results.values())
    assert {r.argmax_prediction for r in results.values()} == {"Electronics"}


# -------------------------------------------------------------------- ranking
def test_top_k_ranking_order_and_limit():
    ranker = RankerService()
    ranked = ranker.rank([0.05, 0.48, 0.47], CATS, top_k=2)
    assert [(r.rank, r.category) for r in ranked] == [(1, "Furniture"), (2, "Clothing")]
    assert ranked[0].probability == pytest.approx(0.48)


def test_top_k_is_capped_by_category_count():
    result = decode([0.91, 0.06, 0.03], top_k=10)
    assert len(result.top_k) == 3
    assert [r.rank for r in result.top_k] == [1, 2, 3]


def test_top_k_one():
    result = decode([0.2, 0.7, 0.1], top_k=1)
    assert [r.category for r in result.top_k] == ["Furniture"]
    assert result.alternatives == ()


def test_batch_matches_single_decoding():
    matrix = [[0.91, 0.06, 0.03], [0.48, 0.47, 0.05], [0.34, 0.33, 0.33], [0.1, 0.1, 0.8]]
    decoder = SafeDecoder()
    batch = decoder.decode_batch(matrix, CATS)
    singles = [decoder.decode(v, CATS) for v in matrix]
    assert [b.status for b in batch] == [s.status for s in singles]
    assert [b.prediction for b in batch] == [s.prediction for s in singles]


# ------------------------------------------------------------ normalization
def test_normalization_rescales_vector():
    vector = normalize_vector([2, 1, 1])
    assert vector.tolist() == pytest.approx([0.5, 0.25, 0.25])
    assert vector.sum() == pytest.approx(1.0)


def test_decode_with_normalize_flag():
    # 0.64 / 0.28 / 0.08 after normalising [0.8, 0.35, 0.1] (sum 1.25)
    result = SafeDecoder().decode([0.8, 0.35, 0.1], CATS, normalize=True)
    assert sum(result.probabilities) == pytest.approx(1.0)
    assert result.confidence == pytest.approx(0.64)


def test_zero_vector_cannot_be_normalized():
    with pytest.raises(ProbabilitySumError):
        normalize_vector([0, 0, 0])


# ----------------------------------------------------------------- validation
def test_probabilities_not_summing_to_one_are_rejected():
    with pytest.raises(ProbabilitySumError) as exc:
        SafeDecoder().decode([0.5, 0.3, 0.1], CATS)
    assert exc.value.code == "PROBABILITY_SUM_INVALID"


def test_small_rounding_error_is_tolerated():
    result = SafeDecoder().decode([0.3334, 0.3333, 0.3332], CATS)
    assert result.status is DecodeStatus.AMBIGUOUS


def test_negative_probability_is_rejected():
    with pytest.raises(NegativeProbabilityError):
        SafeDecoder().decode([1.1, -0.1, 0.0], CATS)


def test_probability_greater_than_one_is_rejected():
    with pytest.raises(ProbabilityRangeError):
        SafeDecoder().decode([1.5, 0.0, 0.0], CATS, normalize=True)


def test_wrong_vector_length_is_rejected():
    with pytest.raises(ProbabilityLengthError):
        SafeDecoder().decode([0.5, 0.5], CATS)


@pytest.mark.parametrize("bad", [[0.5, "x", 0.5], [0.5, None, 0.5], [float("nan"), 0.5, 0.5], "0.5,0.5", None])
def test_malformed_vectors_are_rejected(bad):
    with pytest.raises(MalformedProbabilityError):
        validate_probabilities(bad, 3)


@pytest.mark.parametrize("categories", [[], ["Only"], ["A", "A"], ["A", ""], None])
def test_invalid_categories_are_rejected(categories):
    with pytest.raises(InvalidCategoriesError):
        SafeDecoder().decode([0.5, 0.5], categories)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"confidence_threshold": 1.2},
        {"confidence_threshold": -0.1},
        {"near_tie_threshold": 2},
        {"top_k": 0},
        {"top_k": 11},
        {"mode": "yolo"},
    ],
)
def test_invalid_config_is_rejected(kwargs):
    with pytest.raises(InvalidThresholdError):
        DecodeConfig(**kwargs)


def test_matrix_errors_reference_row_number():
    with pytest.raises(NegativeProbabilityError) as exc:
        SafeDecoder().decode_batch([[0.9, 0.05, 0.05], [0.5, 0.6, -0.1]], CATS)
    assert exc.value.details["row"] == 2
    assert str(exc.value).startswith("Row 2:")


def test_detector_can_be_used_standalone():
    detector = AmbiguityDetector(confidence_threshold=0.75, near_tie_threshold=0.05)
    assessment = detector.assess(np.array([0.48, 0.47, 0.05]), CATS)
    assert not assessment.is_safe
    assert assessment.is_near_tie
    assert assessment.gap == pytest.approx(0.01)
