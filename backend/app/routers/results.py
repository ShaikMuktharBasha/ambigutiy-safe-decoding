"""Results, review, audit and export endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response

from app.dependencies import Container, get_container
from app.models.misc import (
    AuditLogResponse,
    BulkReviewRequest,
    BulkReviewResponse,
    ReviewRequest,
    ReviewResponse,
)
from app.models.results import EvaluationOut, ResultsPage, ResultsSummary, RowResult
from app.services import results_service, review_service
from app.services.export_service import export_csv
from app.services.pipeline_service import require_results
from app.utils.errors import NotFoundError

router = APIRouter(tags=["results"])

StatusFilter = Literal[
    "all", "needs_review", "flagged", "SAFE", "UNCERTAIN", "AMBIGUOUS", "REJECTED", "MANUALLY_REVIEWED"
]
SortField = Literal["row_id", "confidence", "gap", "status", "prediction", "original_value"]


@router.get("/results/{dataset_id}", response_model=ResultsPage)
def get_results(
    dataset_id: str,
    status: StatusFilter = "all",
    search: str | None = Query(None, max_length=200),
    sort_by: SortField = "row_id",
    sort_dir: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    container: Container = Depends(get_container),
) -> dict:
    record = container.store.get(dataset_id)
    return results_service.query_rows(
        record,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )


@router.get("/results/{dataset_id}/summary", response_model=ResultsSummary)
def get_summary(dataset_id: str, container: Container = Depends(get_container)) -> dict:
    return results_service.summary(container.store.get(dataset_id))


@router.get("/results/{dataset_id}/evaluation", response_model=EvaluationOut)
def get_evaluation(dataset_id: str, container: Container = Depends(get_container)) -> dict:
    return results_service.evaluation(container.store.get(dataset_id))


@router.get("/results/{dataset_id}/rows/{row_id}", response_model=RowResult)
def get_row(dataset_id: str, row_id: int, container: Container = Depends(get_container)) -> dict:
    record = container.store.get(dataset_id)
    results = require_results(record)
    if not 1 <= row_id <= len(results):
        raise NotFoundError(f"Row {row_id} does not exist.", code="ROW_NOT_FOUND")
    return results_service.row_view(record, row_id - 1)


@router.post("/review", response_model=ReviewResponse)
def review(body: ReviewRequest, container: Container = Depends(get_container)) -> dict:
    record = container.store.get(body.dataset_id)
    return review_service.review_row(
        container.store, record, body.row_id, body.action, body.category, body.note
    )


@router.post("/review/bulk", response_model=BulkReviewResponse)
def review_bulk(body: BulkReviewRequest, container: Container = Depends(get_container)) -> dict:
    record = container.store.get(body.dataset_id)
    return review_service.bulk_review(container.store, record, body.row_ids, body.action, body.note)


@router.get("/audit/{dataset_id}", response_model=AuditLogResponse)
def get_audit(dataset_id: str, container: Container = Depends(get_container)) -> dict:
    record = container.store.get(dataset_id)
    items = [a.__dict__ for a in reversed(record.audit)]
    return {"dataset_id": record.id, "dataset_name": record.name, "total": len(items), "items": items}


@router.get("/export/{dataset_id}")
def export(
    dataset_id: str,
    kind: Literal["results", "corrected", "ambiguous", "audit"] = "results",
    container: Container = Depends(get_container),
) -> Response:
    record = container.store.get(dataset_id)
    filename, content = export_csv(record, kind)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
