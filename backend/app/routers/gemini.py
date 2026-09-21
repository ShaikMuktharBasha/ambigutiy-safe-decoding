"""Optional Gemini endpoints. Every Gemini output goes through SafeDecoder."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.core import SafeDecoder
from app.dependencies import Container, get_container
from app.models.datasets import DatasetDetail, GeminiDatasetRequest
from app.models.misc import GeminiClassifyRequest, GeminiClassifyResponse, GeminiConfigRequest, GeminiStatus
from app.services.views import dataset_detail, decode_result_view
from app.utils.serialization import r6

router = APIRouter(prefix="/gemini", tags=["gemini"])


@router.get("/status", response_model=GeminiStatus)
def gemini_status(container: Container = Depends(get_container)) -> dict:
    return container.gemini.status()


@router.put("/config", response_model=GeminiStatus)
def update_gemini_config(body: GeminiConfigRequest, container: Container = Depends(get_container)) -> dict:
    """Set or clear the Gemini API key / model from the Settings page.

    Only fields actually present in the request body are touched (a field
    omitted entirely is left as-is); an empty string clears that field back
    to its environment-variable / default value. The key itself is never
    echoed back - only `configured`, `source` and a short `key_preview`.
    """
    provided = body.model_dump(exclude_unset=True)
    if "api_key" in provided:
        key = (provided["api_key"] or "").strip()
        if key:
            container.gemini_config.set_api_key(key)
        else:
            container.gemini_config.clear_api_key()
    if "model" in provided:
        model = (provided["model"] or "").strip()
        if model:
            container.gemini_config.set_model(model)
        else:
            container.gemini_config.clear_model()
    return container.gemini.status()


@router.post("/classify", response_model=GeminiClassifyResponse)
async def gemini_classify(body: GeminiClassifyRequest, container: Container = Depends(get_container)) -> dict:
    raw_scores, vector = await run_in_threadpool(container.gemini.classify_text, body.text, body.categories)
    config = container.decode_settings.resolve(
        confidence_threshold=body.confidence_threshold,
        near_tie_threshold=body.near_tie_threshold,
        mode=body.mode,
        top_k=body.top_k,
    )
    # The local decoder always makes the final safety decision.
    result = SafeDecoder(config, sum_tolerance=container.settings.probability_sum_tolerance).decode(
        vector, body.categories
    )
    return {
        "provider": "gemini",
        "model": container.gemini.config.model,
        "text": body.text,
        "raw_scores": raw_scores,
        "probabilities": [r6(p) for p in vector],
        "decode": decode_result_view(result),
    }


@router.post("/datasets/{dataset_id}", response_model=DatasetDetail)
async def gemini_dataset(
    dataset_id: str, body: GeminiDatasetRequest, container: Container = Depends(get_container)
) -> dict:
    record = container.store.get(dataset_id)
    await run_in_threadpool(
        container.pipeline.apply_gemini, record, container.gemini, body.text_column, body.max_rows
    )
    return dataset_detail(record)
