"""Manual review of flagged rows, with an append-only audit trail."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Any

from app.core import DecodeStatus
from app.utils.errors import InputValidationError, NotFoundError, PipelineStateError
from app.utils.serialization import r6, utc_now

from .pipeline_service import require_results
from .results_service import needs_review_count, row_view, status_counts
from .store import AuditRecord, DatasetRecord, DatasetStore, ReviewRecord


def _apply(
    record: DatasetRecord, row_id: int, action: str, category: str | None, note: str | None
) -> AuditRecord:
    results = require_results(record)
    if not 1 <= row_id <= len(results):
        raise NotFoundError(
            f"Row {row_id} does not exist (dataset has {len(results)} rows).", code="ROW_NOT_FOUND"
        )
    result = results[row_id - 1]
    categories = record.encoding.categories  # type: ignore[union-attr]
    existing = record.reviews.get(row_id)
    previous_status = DecodeStatus.MANUALLY_REVIEWED.value if existing else result.status.value
    top1 = result.top1.category
    top2 = result.top2.category if result.top2 else None

    if action == "accept":
        selected: str | None = top1
        audit_action = "ACCEPT_TOP"
    elif action == "choose":
        chosen = (category or "").strip()
        if not chosen:
            raise InputValidationError("Choose a category for this row.", code="MISSING_CATEGORY")
        if chosen not in categories:
            raise InputValidationError(
                f"'{chosen}' is not one of this dataset's categories.",
                code="UNKNOWN_CATEGORY",
                details={"categories": list(categories)},
            )
        selected = chosen
        if chosen == top1:
            audit_action = "ACCEPT_TOP"
        elif chosen == top2:
            audit_action = "CHOOSE_ALTERNATIVE"
        else:
            audit_action = "CHOOSE_OTHER"
    elif action == "reject":
        selected = None
        audit_action = "REJECT"
    elif action == "revert":
        if existing is None:
            raise PipelineStateError(
                f"Row {row_id} has no manual decision to revert.", code="NOTHING_TO_REVERT"
            )
        selected = None
        audit_action = "REVERT"
    else:  # pragma: no cover - guarded by the request schema
        raise InputValidationError(f"Unknown review action '{action}'.", code="INVALID_ACTION")

    timestamp = utc_now()
    clean_note = note.strip() if note and note.strip() else None
    if action == "revert":
        record.reviews.pop(row_id, None)
        new_status = result.status.value
    else:
        record.reviews[row_id] = ReviewRecord(
            row_id=row_id,
            action=audit_action,
            selected_category=selected,
            previous_status=previous_status,
            original_prediction=top1,
            timestamp=timestamp,
            note=clean_note,
        )
        new_status = DecodeStatus.MANUALLY_REVIEWED.value

    audit = AuditRecord(
        id=uuid.uuid4().hex[:16],
        timestamp=timestamp,
        dataset_id=record.id,
        row_id=row_id,
        column=record.target_column,
        action=audit_action,
        original_value=record.labels()[row_id - 1],
        original_prediction=top1,
        decoder_prediction=result.prediction,
        selected_category=selected,
        previous_status=previous_status,
        new_status=new_status,
        confidence=r6(result.confidence),
        gap=r6(result.gap),
        mode=record.decode_config.mode.value if record.decode_config else None,
        note=clean_note,
    )
    record.audit.append(audit)
    return audit


def review_row(
    store: DatasetStore,
    record: DatasetRecord,
    row_id: int,
    action: str,
    category: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    with record.lock:
        audit = _apply(record, row_id, action, category, note)
        record.touch()
    store.save(record)
    return {
        "row": row_view(record, row_id - 1),
        "audit": asdict(audit),
        "counts": status_counts(record),
        "needs_review": needs_review_count(record),
    }


def bulk_review(
    store: DatasetStore,
    record: DatasetRecord,
    row_ids: list[int],
    action: str,
    note: str | None = None,
) -> dict[str, Any]:
    require_results(record)
    applied: list[AuditRecord] = []
    skipped = 0
    with record.lock:
        for row_id in dict.fromkeys(row_ids):  # de-duplicate, keep order
            reviewed = row_id in record.reviews
            if (action == "revert" and not reviewed) or (action != "revert" and reviewed):
                skipped += 1
                continue
            applied.append(_apply(record, row_id, action, None, note))
        if applied:
            record.touch()
    if applied:
        store.save(record)
    return {
        "applied": len(applied),
        "skipped": skipped,
        "audit": [asdict(a) for a in applied],
        "counts": status_counts(record),
        "needs_review": needs_review_count(record),
    }
