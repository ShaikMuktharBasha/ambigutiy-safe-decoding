"""Builders that turn domain records into API-shaped dictionaries."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from app.core import DecodeResult, EncoderService

from .dataset_service import suggest_column
from .pipeline_service import suggest_probability_columns
from .store import DatasetRecord
from app.utils.serialization import r6


def ranked_view(result: DecodeResult) -> list[dict[str, Any]]:
    return [
        {"rank": r.rank, "category": r.category, "index": r.index, "probability": r6(r.probability)}
        for r in result.top_k
    ]


def decode_result_view(result: DecodeResult) -> dict[str, Any]:
    top_k = ranked_view(result)
    return {
        "prediction": result.prediction,
        "argmax_prediction": result.argmax_prediction,
        "status": result.status.value,
        "confidence": r6(result.confidence),
        "gap": r6(result.gap),
        "reason": result.reason,
        "reason_code": result.reason_code.value,
        "reason_label": result.reason_label,
        "warning": result.warning,
        "top_k": top_k,
        "alternatives": top_k[1:],
        "top_1": result.top1.category,
        "top_1_probability": r6(result.top1.probability),
        "top_2": result.top2.category if result.top2 else None,
        "top_2_probability": r6(result.top2.probability) if result.top2 else None,
        "threshold": result.threshold,
        "near_tie_threshold": result.near_tie_threshold,
        "mode": result.mode.value,
        "flags": [f.value for f in result.flags],
        "tied_candidates": list(result.tied_candidates),
        "requires_review": result.requires_review,
        "probabilities": [r6(p) for p in result.probabilities],
    }


def pipeline_state(record: DatasetRecord) -> dict[str, Any]:
    if record.results is not None:
        stage = "decoded"
    elif record.probabilities is not None:
        stage = "probabilities_ready"
    elif record.encoding is not None:
        stage = "column_selected"
    else:
        stage = "uploaded"
    return {
        "stage": stage,
        "has_encoding": record.encoding is not None,
        "has_probabilities": record.probabilities is not None,
        "has_results": record.results is not None,
        "probability_source": record.probability_meta.get("source"),
        "probability_meta": record.probability_meta,
        "decode_config": record.decode_config.to_dict() if record.decode_config else None,
        "decoded_at": record.decoded_at,
        "reviewed_rows": len(record.reviews),
        "audit_records": len(record.audit),
    }


def dataset_summary(record: DatasetRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "name": record.name,
        "source": record.source,
        "filename": record.filename,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "row_count": record.row_count,
        "column_count": record.column_count,
        "target_column": record.target_column,
        "category_count": record.encoding.size if record.encoding else 0,
        "pipeline": pipeline_state(record),
    }


def encoding_view(record: DatasetRecord, preview_rows: int = 8) -> dict[str, Any] | None:
    encoding = record.encoding
    if encoding is None:
        return None
    labels = record.labels()
    counts = {c: 0 for c in encoding.categories}
    for label in labels:
        if label in counts:
            counts[label] += 1
    preview_labels = labels[:preview_rows]
    vectors = EncoderService().transform(preview_labels, encoding) if preview_labels else []
    return {
        "dataset_id": record.id,
        "column": record.target_column,
        "order": record.category_order,
        "categories": list(encoding.categories),
        "mapping": [
            {"category": c, "index": i, "one_hot": encoding.one_hot(c), "count": counts[c]}
            for i, c in enumerate(encoding.categories)
        ],
        "unencoded_rows": sum(1 for label in labels if label is None),
        "vectors_preview": [
            {"row_id": i + 1, "value": preview_labels[i], "one_hot": [int(x) for x in vectors[i]]}
            for i in range(len(preview_labels))
        ],
    }


def dataset_detail(record: DatasetRecord, preview_rows: int = 50) -> dict[str, Any]:
    profiles = record.profiles
    return {
        **dataset_summary(record),
        "columns": profiles,
        "suggested_column": suggest_column(profiles),
        "categorical_columns": [p["name"] for p in profiles if p["is_categorical"]],
        "text_columns": [p["name"] for p in profiles if p["dtype"] == "text"],
        "numeric_columns": [p["name"] for p in profiles if p["dtype"] in ("integer", "float")],
        "preview": record.records()[:preview_rows],
        "encoding": encoding_view(record),
        "suggested_probability_columns": suggest_probability_columns(record),
    }


def review_view(record: DatasetRecord, row_id: int) -> dict[str, Any] | None:
    review = record.reviews.get(row_id)
    return asdict(review) if review else None
