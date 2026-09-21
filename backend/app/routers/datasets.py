"""Dataset upload, demo, encoding and probability-vector endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core import EncoderService
from app.dependencies import Container, get_container
from app.models.common import DecodeSettingsOverride
from app.models.datasets import (
    DatasetDetail,
    DatasetSummary,
    DemoRequest,
    EncodeRequest,
    EncodingOut,
    ProbabilityColumnsRequest,
    SimulateDatasetRequest,
)
from app.models.results import ResultsSummary
from app.services import results_service
from app.services.dataset_service import create_demo_dataset, create_upload_dataset, validate_upload_name
from app.services.views import dataset_detail, dataset_summary, encoding_view
from app.utils.errors import PayloadTooLargeError

router = APIRouter(tags=["datasets"])

_CHUNK = 1024 * 1024


async def _read_limited(file: UploadFile, limit: int, limit_mb: float) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        size += len(chunk)
        if size > limit:
            raise PayloadTooLargeError(f"The file exceeds the {limit_mb:g} MB upload limit.")
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/datasets", response_model=list[DatasetSummary])
def list_datasets(container: Container = Depends(get_container)) -> list[dict]:
    return [dataset_summary(r) for r in container.store.list()]


@router.post("/datasets/upload", response_model=DatasetDetail, status_code=201)
async def upload_dataset(
    file: UploadFile = File(..., description="A .csv or .xlsx file"),
    container: Container = Depends(get_container),
) -> dict:
    settings = container.settings
    validate_upload_name(file.filename)
    content = await _read_limited(file, settings.max_upload_bytes, settings.max_upload_mb)
    record = await run_in_threadpool(
        create_upload_dataset, container.store, file.filename or "upload.csv", content, settings
    )
    return dataset_detail(record)


@router.post("/datasets/demo", response_model=DatasetDetail, status_code=201)
def load_demo(body: DemoRequest | None = None, container: Container = Depends(get_container)) -> dict:
    body = body or DemoRequest()
    seed = body.seed if body.seed is not None else 42
    record = create_demo_dataset(container.store, container.settings, rows=body.rows, seed=seed)
    if body.run_pipeline:
        container.pipeline.select_column(record, "product_type")
        container.pipeline.simulate(record, seed=seed)
        container.pipeline.decode(record, container.decode_settings.get())
    return dataset_detail(record)


@router.get("/datasets/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: str, container: Container = Depends(get_container)) -> dict:
    return dataset_detail(container.store.get(dataset_id))


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, container: Container = Depends(get_container)) -> Response:
    container.store.delete(dataset_id)
    return Response(status_code=204)


@router.post("/encode", response_model=EncodingOut)
def encode(body: EncodeRequest, container: Container = Depends(get_container)) -> dict:
    """Build the category <-> index <-> one-hot mapping.

    * ``dataset_id`` + ``column``: selects the dataset's categorical column
      (resets any downstream probabilities and results).
    * ``values``: stateless encoding of an ad-hoc list of values.
    """
    if body.dataset_id is not None:
        record = container.store.get(body.dataset_id)
        container.pipeline.select_column(record, body.column or "", body.order)
        return encoding_view(record) or {}

    encoder = EncoderService(order=body.order, max_categories=container.settings.max_categories)
    values = body.values or []
    encoding, matrix = encoder.fit_transform(values)
    labels = [None if v is None else str(v).strip() or None for v in values]
    counts = {c: 0 for c in encoding.categories}
    for label in labels:
        if label in counts:
            counts[label] += 1
    return {
        "dataset_id": None,
        "column": None,
        "order": body.order,
        "categories": list(encoding.categories),
        "mapping": [
            {"category": c, "index": i, "one_hot": encoding.one_hot(c), "count": counts[c]}
            for i, c in enumerate(encoding.categories)
        ],
        "unencoded_rows": sum(1 for label in labels if label is None),
        "vectors_preview": [
            {"row_id": i + 1, "value": labels[i], "one_hot": [int(x) for x in matrix[i]]}
            for i in range(min(len(labels), 20))
        ],
    }


@router.post("/datasets/{dataset_id}/simulate", response_model=DatasetDetail)
def simulate_dataset(
    dataset_id: str,
    body: SimulateDatasetRequest | None = None,
    container: Container = Depends(get_container),
) -> dict:
    body = body or SimulateDatasetRequest()
    record = container.store.get(dataset_id)
    container.pipeline.simulate(record, seed=body.seed, mix=body.mix)
    return dataset_detail(record)


@router.post("/datasets/{dataset_id}/probabilities/columns", response_model=DatasetDetail)
def import_probability_columns(
    dataset_id: str, body: ProbabilityColumnsRequest, container: Container = Depends(get_container)
) -> dict:
    record = container.store.get(dataset_id)
    container.pipeline.import_columns(record, body.mapping, body.normalize)
    return dataset_detail(record)


@router.post("/datasets/{dataset_id}/decode", response_model=ResultsSummary)
def decode_dataset(
    dataset_id: str,
    body: DecodeSettingsOverride | None = None,
    container: Container = Depends(get_container),
) -> dict:
    record = container.store.get(dataset_id)
    overrides = (body or DecodeSettingsOverride()).model_dump()
    config = container.decode_settings.resolve(**overrides)
    container.pipeline.decode(record, config)
    return results_service.summary(record)
