"""CSV exports: full results, corrected dataset, flagged rows and audit log."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import asdict, fields
from typing import Any, Literal

from app.utils.serialization import r6, sanitize_csv_cell

from .pipeline_service import require_results
from .results_service import effective_status, final_value
from .store import AuditRecord, DatasetRecord

ExportKind = Literal["results", "corrected", "ambiguous", "audit"]

RESULT_COLUMNS = [
    "row_id",
    "original_value",
    "predicted_value",
    "decoder_prediction",
    "confidence",
    "top_1",
    "top_2",
    "top_1_probability",
    "top_2_probability",
    "probability_gap",
    "status",
    "computed_status",
    "reason",
    "warning",
    "decoding_mode",
    "confidence_threshold",
    "near_tie_threshold",
    "manually_reviewed",
    "review_action",
]


def _file_stem(record: DatasetRecord) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", record.name).strip("_")[:40] or "dataset"


def _result_row(record: DatasetRecord, index: int) -> dict[str, Any]:
    result = record.results[index]  # type: ignore[index]
    config = record.decode_config
    review = record.reviews.get(index + 1)
    row = {
        "row_id": index + 1,
        "original_value": record.labels()[index],
        "predicted_value": final_value(record, index),
        "decoder_prediction": result.prediction,
        "confidence": r6(result.confidence),
        "top_1": result.top1.category,
        "top_2": result.top2.category if result.top2 else None,
        "top_1_probability": r6(result.top1.probability),
        "top_2_probability": r6(result.top2.probability) if result.top2 else None,
        "probability_gap": r6(result.gap),
        "status": effective_status(record, index),
        "computed_status": result.status.value,
        "reason": result.reason,
        "warning": result.warning,
        "decoding_mode": config.mode.value if config else None,
        "confidence_threshold": config.confidence_threshold if config else None,
        "near_tie_threshold": config.near_tie_threshold if config else None,
        "manually_reviewed": review is not None,
        "review_action": review.action if review else None,
    }
    for category, probability in zip(record.encoding.categories, result.probabilities):  # type: ignore[union-attr]
        row[f"p_{category}"] = r6(probability)
    return row


def _write(columns: list[str], rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: sanitize_csv_cell("" if v is None else v) for k, v in row.items()})
    return buffer.getvalue()


def export_csv(record: DatasetRecord, kind: ExportKind) -> tuple[str, str]:
    stem = _file_stem(record)
    if kind == "audit":
        columns = [f.name for f in fields(AuditRecord)]
        return f"{stem}_audit_log.csv", _write(columns, [asdict(a) for a in record.audit])

    results = require_results(record)
    probability_columns = [f"p_{c}" for c in record.encoding.categories]  # type: ignore[union-attr]

    if kind == "results":
        rows = [_result_row(record, i) for i in range(len(results))]
        return f"{stem}_results.csv", _write(RESULT_COLUMNS + probability_columns, rows)

    if kind == "ambiguous":
        rows = [_result_row(record, i) for i, r in enumerate(results) if r.status.value != "SAFE"]
        return f"{stem}_flagged_rows.csv", _write(RESULT_COLUMNS + probability_columns, rows)

    # corrected dataset: original columns + decoded value and status
    original_columns = [str(c) for c in record.frame.columns]
    target = record.target_column or "value"

    def unique(name: str) -> str:
        candidate, n = name, 2
        while candidate in original_columns:
            candidate, n = f"{name}_{n}", n + 1
        return candidate

    decoded_col = unique(f"{target}_decoded")
    status_col = unique("decode_status")
    reviewed_col = unique("manually_reviewed")
    rows = []
    for i, original in enumerate(record.records()):
        rows.append(
            {
                **original,
                decoded_col: final_value(record, i),
                status_col: effective_status(record, i),
                reviewed_col: (i + 1) in record.reviews,
            }
        )
    return f"{stem}_corrected.csv", _write(original_columns + [decoded_col, status_col, reviewed_col], rows)
