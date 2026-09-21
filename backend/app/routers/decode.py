"""Stateless decoding and simulation endpoints."""

from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends

from app.core import DecodeConfig, DecodingMode, SafeDecoder, normalize_vector, validate_categories
from app.dependencies import Container, get_container
from app.models.decode import (
    BatchDecodeRequest,
    BatchDecodeResponse,
    CompareModesResponse,
    DecodeRequest,
    DecodeResponse,
)
from app.models.misc import ExampleVectorRequest, ExampleVectorResponse, NormalizeRequest, NormalizeResponse
from app.services.simulation_service import ProbabilitySimulator
from app.services.views import decode_result_view
from app.utils.serialization import r6

router = APIRouter(tags=["decoding"])


def _decoder(container: Container, body: DecodeRequest | BatchDecodeRequest, mode: str | None = None) -> SafeDecoder:
    config = container.decode_settings.resolve(
        confidence_threshold=body.confidence_threshold,
        near_tie_threshold=body.near_tie_threshold,
        mode=mode or body.mode,
        top_k=body.top_k,
    )
    return SafeDecoder(config, sum_tolerance=container.settings.probability_sum_tolerance)


@router.post("/decode", response_model=DecodeResponse)
def decode(body: DecodeRequest, container: Container = Depends(get_container)) -> dict:
    """Safely decode one probability vector.

    The local ambiguity detector performs the decision: confidence check,
    near-tie check, top-k ranking and the strict / soft / advisory policy.
    """
    result = _decoder(container, body).decode(body.probabilities, body.categories, normalize=body.normalize)
    return decode_result_view(result)


@router.post("/decode/batch", response_model=BatchDecodeResponse)
def decode_batch(body: BatchDecodeRequest, container: Container = Depends(get_container)) -> dict:
    results = _decoder(container, body).decode_batch(body.probabilities, body.categories, normalize=body.normalize)
    counts = Counter(r.status.value for r in results)
    return {
        "total": len(results),
        "counts": dict(counts),
        "results": [decode_result_view(r) for r in results],
    }


@router.post("/decode/compare", response_model=CompareModesResponse)
def compare_modes(body: DecodeRequest, container: Container = Depends(get_container)) -> dict:
    """Decode the same vector under standard argmax and all three safe modes."""
    views = {}
    for mode in DecodingMode:
        result = _decoder(container, body, mode.value).decode(
            body.probabilities, body.categories, normalize=body.normalize
        )
        views[mode.value] = decode_result_view(result)
    strict = views["strict"]
    return {
        "argmax": {"prediction": strict["argmax_prediction"], "confidence": strict["confidence"]},
        **views,
    }


@router.post("/simulate/vector", response_model=ExampleVectorResponse)
def example_vector(body: ExampleVectorRequest) -> dict:
    categories = validate_categories(body.categories)
    simulator = ProbabilitySimulator(body.seed)
    vector = simulator.example_vector(categories, body.scenario)
    return {
        "categories": list(categories),
        "probabilities": [r6(p) for p in vector],
        "scenario": body.scenario,
        "seed": simulator.seed,
    }


@router.post("/simulate/normalize", response_model=NormalizeResponse)
def normalize(body: NormalizeRequest) -> dict:
    original_sum = float(sum(body.probabilities))
    vector = normalize_vector(body.probabilities)
    rounded = [round(float(p), 6) for p in vector]
    # Keep the rounded vector summing to exactly 1.
    drift = round(1.0 - sum(rounded), 6)
    if drift:
        top = max(range(len(rounded)), key=rounded.__getitem__)
        rounded[top] = round(rounded[top] + drift, 6)
    return {"probabilities": rounded, "original_sum": r6(original_sum)}


# Exposed for tests / reuse.
__all__ = ["router", "DecodeConfig"]
