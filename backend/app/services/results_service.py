"""Querying, summarising and evaluating decode results."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import asdict
from typing import Any

import numpy as np
from sklearn.metrics import accuracy_score

from app.core import DecodeStatus, RankerService
from app.core.types import COMPARISON_EPSILON
from app.utils.serialization import r6

from .pipeline_service import require_results
from .store import DatasetRecord

STATUSES = [s.value for s in DecodeStatus]
STATUS_SEVERITY = {"SAFE": 0, "UNCERTAIN": 1, "AMBIGUOUS": 2, "REJECTED": 3, "MANUALLY_REVIEWED": 4}


def effective_status(record: DatasetRecord, index: int) -> str:
    if (index + 1) in record.reviews:
        return DecodeStatus.MANUALLY_REVIEWED.value
    return record.results[index].status.value  # type: ignore[index]


def final_value(record: DatasetRecord, index: int) -> str | None:
    review = record.reviews.get(index + 1)
    if review is not None:
        return review.selected_category
    return record.results[index].prediction  # type: ignore[index]


def row_view(record: DatasetRecord, index: int) -> dict[str, Any]:
    results = require_results(record)
    result = results[index]
    row_id = index + 1
    review = record.reviews.get(row_id)
    label = record.labels()[index]
    categories = record.encoding.categories  # type: ignore[union-attr]
    status = effective_status(record, index)
    return {
        "row_id": row_id,
        "original_value": label,
        "prediction": result.prediction,
        "final_value": final_value(record, index),
        "argmax_prediction": result.argmax_prediction,
        "status": status,
        "computed_status": result.status.value,
        "confidence": r6(result.confidence),
        "gap": r6(result.gap),
        "top_1": result.top1.category,
        "top_1_probability": r6(result.top1.probability),
        "top_2": result.top2.category if result.top2 else None,
        "top_2_probability": r6(result.top2.probability) if result.top2 else None,
        "reason": result.reason,
        "reason_code": result.reason_code.value,
        "reason_label": result.reason_label,
        "warning": result.warning,
        "flags": [f.value for f in result.flags],
        "tied_candidates": list(result.tied_candidates),
        "top_k": [
            {"rank": r.rank, "category": r.category, "index": r.index, "probability": r6(r.probability)}
            for r in result.top_k
        ],
        "probabilities": [
            {"category": c, "index": j, "probability": r6(p)}
            for j, (c, p) in enumerate(zip(categories, result.probabilities))
        ],
        "requires_review": review is None and result.status is not DecodeStatus.SAFE,
        "manually_reviewed": review is not None,
        "review": asdict(review) if review else None,
        "argmax_correct": (result.argmax_prediction == label) if label in categories else None,
        "probability_source": record.probability_sources[index] if record.probability_sources else None,
        "scenario": record.scenarios[index] if record.scenarios else None,
        "context": record.records()[index],
    }


def status_counts(record: DatasetRecord) -> dict[str, int]:
    counts = dict.fromkeys(STATUSES, 0)
    if record.results is None:
        return counts
    for i in range(len(record.results)):
        counts[effective_status(record, i)] += 1
    return counts


def needs_review_count(record: DatasetRecord) -> int:
    if record.results is None:
        return 0
    return sum(
        1
        for i, r in enumerate(record.results)
        if r.status is not DecodeStatus.SAFE and (i + 1) not in record.reviews
    )


def query_rows(
    record: DatasetRecord,
    *,
    status: str = "all",
    search: str | None = None,
    sort_by: str = "row_id",
    sort_dir: str = "asc",
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    results = require_results(record)
    labels = record.labels()
    statuses = [effective_status(record, i) for i in range(len(results))]

    def keep(i: int) -> bool:
        computed = results[i].status.value
        if status == "all":
            return True
        if status == "needs_review":
            return computed != "SAFE" and (i + 1) not in record.reviews
        if status == "flagged":
            return computed != "SAFE"
        return statuses[i] == status

    indices = [i for i in range(len(results)) if keep(i)]

    query = (search or "").strip().casefold()
    if query:
        blobs = record.search_blobs()
        filtered = []
        for i in indices:
            r = results[i]
            decoded_text = " ".join(
                str(x)
                for x in (i + 1, final_value(record, i), r.top1.category, r.top2.category if r.top2 else "", r.reason_label, statuses[i])
                if x is not None
            ).casefold()
            if query in decoded_text or query in blobs[i]:
                filtered.append(i)
        indices = filtered

    key_funcs = {
        "row_id": lambda i: i,
        "confidence": lambda i: results[i].confidence,
        "gap": lambda i: results[i].gap,
        "status": lambda i: STATUS_SEVERITY[statuses[i]],
        "prediction": lambda i: (final_value(record, i) or "").casefold(),
        "original_value": lambda i: (labels[i] or "").casefold(),
    }
    key = key_funcs.get(sort_by, key_funcs["row_id"])
    indices.sort(key=lambda i: (key(i), i), reverse=sort_dir == "desc")

    total = len(indices)
    pages = max(1, math.ceil(total / page_size))
    page = min(max(page, 1), pages)
    window = indices[(page - 1) * page_size : page * page_size]
    return {
        "dataset_id": record.id,
        "target_column": record.target_column,
        "categories": list(record.encoding.categories),  # type: ignore[union-attr]
        "config": record.decode_config.to_dict(),  # type: ignore[union-attr]
        "decoded_at": record.decoded_at,
        "items": [row_view(record, i) for i in window],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "counts": status_counts(record),
    }


def _histogram(confidences: np.ndarray, threshold: float) -> list[dict[str, Any]]:
    edges = np.linspace(0.0, 1.0, 21)
    counts, _ = np.histogram(confidences, bins=edges)
    return [
        {
            "start": round(float(edges[i]), 2),
            "end": round(float(edges[i + 1]), 2),
            "label": f"{edges[i]:.2f}–{edges[i + 1]:.2f}",
            "count": int(counts[i]),
            "below_threshold": bool(edges[i + 1] <= threshold + COMPARISON_EPSILON),
        }
        for i in range(len(counts))
    ]


def summary(record: DatasetRecord, recent_limit: int = 8) -> dict[str, Any]:
    base: dict[str, Any] = {
        "dataset_id": record.id,
        "dataset_name": record.name,
        "decoded": record.results is not None,
        "total_rows": record.row_count,
        "target_column": record.target_column,
        "categories": list(record.encoding.categories) if record.encoding else [],
        "config": record.decode_config.to_dict() if record.decode_config else None,
        "decoded_at": record.decoded_at,
        "counts": status_counts(record),
        "computed_counts": dict.fromkeys(STATUSES, 0),
        "needs_review": 0,
        "reviewed": len(record.reviews),
        "average_confidence": None,
        "median_confidence": None,
        "average_gap": None,
        "confidence_histogram": [],
        "category_counts": [],
        "unresolved": 0,
        "reason_counts": {},
        "probability_source": record.probability_meta.get("source"),
        "recent": [],
    }
    if record.results is None:
        return base

    results = record.results
    confidences = np.array([r.confidence for r in results])
    gaps = np.array([r.gap for r in results])
    computed = Counter(r.status.value for r in results)
    finals = [final_value(record, i) for i in range(len(results))]
    final_counts = Counter(v for v in finals if v is not None)
    argmax_counts = Counter(r.argmax_prediction for r in results)

    reviewed_ids = sorted(record.reviews.values(), key=lambda rv: rv.timestamp, reverse=True)
    recent_indices = [rv.row_id - 1 for rv in reviewed_ids[:recent_limit]]
    for i in range(len(results)):
        if len(recent_indices) >= recent_limit:
            break
        if i not in recent_indices:
            recent_indices.append(i)

    base.update(
        {
            "computed_counts": {s: computed.get(s, 0) for s in STATUSES},
            "needs_review": needs_review_count(record),
            "average_confidence": r6(confidences.mean()),
            "median_confidence": r6(float(np.median(confidences))),
            "average_gap": r6(gaps.mean()),
            "confidence_histogram": _histogram(confidences, record.decode_config.confidence_threshold),  # type: ignore[union-attr]
            "category_counts": [
                {"category": c, "count": final_counts.get(c, 0), "argmax_count": argmax_counts.get(c, 0)}
                for c in record.encoding.categories  # type: ignore[union-attr]
            ],
            "unresolved": sum(1 for v in finals if v is None),
            "reason_counts": dict(Counter(r.reason_label for r in results).most_common()),
            "recent": [row_view(record, i) for i in recent_indices],
        }
    )
    return base


def _ratio(numerator: float, denominator: float) -> float | None:
    return r6(numerator / denominator) if denominator else None


def evaluation(record: DatasetRecord) -> dict[str, Any]:
    results = require_results(record)
    encoding = record.encoding
    config = record.decode_config
    assert encoding is not None and config is not None and record.probabilities is not None
    mapping = encoding.mapping
    labels = record.labels()
    idx = np.array([i for i, label in enumerate(labels) if label in mapping], dtype=int)
    n = int(idx.size)

    notes = [
        "Original column values are treated as ground truth for evaluation.",
        "Standard argmax always returns a category; the safe decoder can abstain or flag rows for review.",
    ]
    if record.probability_meta.get("source") == "simulated":
        notes.append(
            "Vectors are simulated: a share of rows are deliberate near ties, diffuse vectors and "
            "overconfident errors. Overconfident errors cannot be caught by confidence checks."
        )

    empty_argmax = {
        "total": 0, "accepted": 0, "abstained": 0, "flagged": 0, "correct": 0, "incorrect": 0,
        "accuracy": None, "silent_errors": 0, "average_confidence": None,
    }
    if n == 0:
        return {
            "dataset_id": record.id,
            "has_ground_truth": False,
            "evaluated_rows": 0,
            "config": config.to_dict(),
            "probability_source": record.probability_meta.get("source"),
            "argmax": empty_argmax,
            "safe": {
                "total": 0, "accepted": 0, "flagged": 0, "abstained": 0,
                "status_counts": dict.fromkeys(STATUSES, 0), "correct_accepted": 0,
                "incorrect_accepted": 0, "coverage": None, "selective_accuracy": None,
                "errors_intercepted": 0, "correct_flagged": 0, "review_rate": None,
                "average_confidence_accepted": None,
            },
            "comparison": {"unsafe_predictions_prevented": 0, "errors_let_through": 0, "error_reduction": None, "accuracy_gain": None},
            "review": {"reviewed": 0, "reviewed_correct": 0, "reviewed_rejected": 0, "human_accuracy": None},
            "sweep": [],
            "scenarios": [],
            "notes": notes,
        }

    truth = np.array([mapping[labels[i]] for i in idx])
    probs = record.probabilities[idx]
    order = RankerService.order(probs)
    rows = np.arange(n)
    p1 = probs[rows, order[:, 0]]
    p2 = probs[rows, order[:, 1]]
    gap = p1 - p2
    predicted = order[:, 0]
    correct = predicted == truth

    computed = np.array([results[i].status.value for i in idx])
    safe = computed == "SAFE"
    flagged = ~safe
    abstained = np.array([results[i].prediction is None for i in idx])

    argmax_metrics = {
        "total": n,
        "accepted": n,
        "abstained": 0,
        "flagged": 0,
        "correct": int(correct.sum()),
        "incorrect": int((~correct).sum()),
        "accuracy": r6(accuracy_score(truth, predicted)),
        "silent_errors": int((~correct).sum()),
        "average_confidence": r6(p1.mean()),
    }
    incorrect_accepted = int((safe & ~correct).sum())
    safe_metrics = {
        "total": n,
        "accepted": int(safe.sum()),
        "flagged": int(flagged.sum()),
        "abstained": int(abstained.sum()),
        "status_counts": {s: int((computed == s).sum()) for s in STATUSES},
        "correct_accepted": int((safe & correct).sum()),
        "incorrect_accepted": incorrect_accepted,
        "coverage": _ratio(safe.sum(), n),
        "selective_accuracy": _ratio((safe & correct).sum(), safe.sum()),
        "errors_intercepted": int((flagged & ~correct).sum()),
        "correct_flagged": int((flagged & correct).sum()),
        "review_rate": _ratio(flagged.sum(), n),
        "average_confidence_accepted": r6(p1[safe].mean()) if safe.any() else None,
    }
    argmax_incorrect = argmax_metrics["incorrect"]
    selective = safe_metrics["selective_accuracy"]
    comparison = {
        "unsafe_predictions_prevented": safe_metrics["errors_intercepted"],
        "errors_let_through": incorrect_accepted,
        "error_reduction": r6(1 - incorrect_accepted / argmax_incorrect) if argmax_incorrect else None,
        "accuracy_gain": r6(selective - argmax_metrics["accuracy"]) if selective is not None else None,
    }

    reviewed = [rv for rv in record.reviews.values() if labels[rv.row_id - 1] in mapping]
    reviewed_rejected = sum(1 for rv in reviewed if rv.selected_category is None)
    reviewed_correct = sum(1 for rv in reviewed if rv.selected_category == labels[rv.row_id - 1])
    review_metrics = {
        "reviewed": len(reviewed),
        "reviewed_correct": reviewed_correct,
        "reviewed_rejected": reviewed_rejected,
        "human_accuracy": _ratio(reviewed_correct, len(reviewed) - reviewed_rejected),
    }

    eps = COMPARISON_EPSILON
    thresholds = sorted({round(t, 2) for t in np.arange(0.30, 0.951, 0.05)} | {round(config.confidence_threshold, 4)})
    sweep = []
    for t in thresholds:
        accepted = (p1 + eps >= t) & (gap + eps >= config.near_tie_threshold) & (gap > eps)
        sweep.append(
            {
                "confidence_threshold": float(t),
                "coverage": r6(accepted.mean()),
                "selective_accuracy": _ratio((accepted & correct).sum(), accepted.sum()),
                "errors_let_through": int((accepted & ~correct).sum()),
                "errors_intercepted": int((~accepted & ~correct).sum()),
                "is_current": abs(t - config.confidence_threshold) < 1e-9,
            }
        )

    scenarios: list[dict[str, Any]] = []
    if record.scenarios:
        by_scenario: dict[str, list[int]] = {}
        for position, i in enumerate(idx):
            by_scenario.setdefault(record.scenarios[i], []).append(position)
        for name, positions in sorted(by_scenario.items(), key=lambda kv: -len(kv[1])):
            pos = np.array(positions)
            scenarios.append(
                {
                    "scenario": name,
                    "total": int(pos.size),
                    "argmax_accuracy": r6(correct[pos].mean()),
                    "status_counts": {s: int((computed[pos] == s).sum()) for s in STATUSES},
                }
            )

    return {
        "dataset_id": record.id,
        "has_ground_truth": True,
        "evaluated_rows": n,
        "config": config.to_dict(),
        "probability_source": record.probability_meta.get("source"),
        "argmax": argmax_metrics,
        "safe": safe_metrics,
        "comparison": comparison,
        "review": review_metrics,
        "sweep": sweep,
        "scenarios": scenarios,
        "notes": notes,
    }
