"""In-memory dataset repository with optional JSON/NPY snapshots on disk.

Snapshots are split so that frequent, small mutations (a manual review) do not
rewrite the full dataset:

* ``<id>.frame.json``  - original rows + column profiles (written once)
* ``<id>.probs.npy``   - probability matrix (written when it changes)
* ``<id>.state.json``  - encoding, decode config, reviews, audit log

Decode results are *not* persisted; they are recomputed deterministically from
the probability matrix and decode config when the API starts.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core import CategoryEncoding, DecodeConfig, DecodeResult, clean_label
from app.utils.errors import NotFoundError
from app.utils.serialization import to_jsonable, utc_now

logger = logging.getLogger(__name__)

_ID_PATTERN = re.compile(r"^[a-f0-9]{12}$")


@dataclass
class ReviewRecord:
    row_id: int
    action: str
    selected_category: str | None
    previous_status: str
    original_prediction: str | None
    timestamp: str
    note: str | None = None


@dataclass
class AuditRecord:
    id: str
    timestamp: str
    dataset_id: str
    row_id: int
    column: str | None
    action: str
    original_value: str | None
    original_prediction: str | None
    decoder_prediction: str | None
    selected_category: str | None
    previous_status: str
    new_status: str
    confidence: float | None
    gap: float | None
    mode: str | None
    note: str | None = None


@dataclass
class DatasetRecord:
    id: str
    name: str
    source: str
    filename: str | None
    frame: pd.DataFrame
    profiles: list[dict[str, Any]]
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    target_column: str | None = None
    category_order: str = "appearance"
    encoding: CategoryEncoding | None = None
    probabilities: np.ndarray | None = None
    probability_sources: list[str] | None = None
    scenarios: list[str] | None = None
    probability_meta: dict[str, Any] = field(default_factory=dict)
    confusables: list[str | None] | None = None
    confusables_column: str | None = None
    decode_config: DecodeConfig | None = None
    decoded_at: str | None = None
    results: list[DecodeResult] | None = None
    reviews: dict[int, ReviewRecord] = field(default_factory=dict)
    audit: list[AuditRecord] = field(default_factory=list)
    lock: Any = field(default_factory=threading.RLock, repr=False)
    _records_cache: list[dict[str, Any]] | None = field(default=None, repr=False)
    _search_cache: list[str] | None = field(default=None, repr=False)
    _labels_cache: list[str | None] | None = field(default=None, repr=False)

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex[:12]

    @property
    def row_count(self) -> int:
        return int(self.frame.shape[0])

    @property
    def column_count(self) -> int:
        return int(self.frame.shape[1])

    def records(self) -> list[dict[str, Any]]:
        """Original rows as JSON-safe dicts (cached; the frame is immutable)."""
        if self._records_cache is None:
            columns = [str(c) for c in self.frame.columns]
            self._records_cache = [
                {column: to_jsonable(value) for column, value in zip(columns, row)}
                for row in self.frame.itertuples(index=False, name=None)
            ]
        return self._records_cache

    def search_blobs(self) -> list[str]:
        if self._search_cache is None:
            self._search_cache = [
                " ".join("" if v is None else str(v) for v in record.values()).casefold()
                for record in self.records()
            ]
        return self._search_cache

    def labels(self) -> list[str | None]:
        """Cleaned values of the selected categorical column (ground truth)."""
        if self.target_column is None:
            return [None] * self.row_count
        if self._labels_cache is None:
            self._labels_cache = [clean_label(v) for v in self.frame[self.target_column].tolist()]
        return self._labels_cache

    def reset_labels(self) -> None:
        self._labels_cache = None

    def touch(self) -> None:
        self.updated_at = utc_now()


class DatasetStore:
    def __init__(self, storage_dir: Path, persist: bool = True) -> None:
        self._records: dict[str, DatasetRecord] = {}
        self._lock = threading.RLock()
        self.persist = persist
        self.directory = Path(storage_dir) / "datasets"
        if persist:
            self.directory.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ CRUD
    def add(self, record: DatasetRecord) -> DatasetRecord:
        with self._lock:
            self._records[record.id] = record
        self.save(record, frame=True, probabilities=True)
        return record

    def get(self, dataset_id: str) -> DatasetRecord:
        record = self._records.get(dataset_id) if _ID_PATTERN.match(dataset_id or "") else None
        if record is None:
            raise NotFoundError(
                f"Dataset '{dataset_id}' was not found. It may have been deleted.",
                code="DATASET_NOT_FOUND",
            )
        return record

    def list(self) -> list[DatasetRecord]:
        with self._lock:
            return sorted(self._records.values(), key=lambda r: r.created_at, reverse=True)

    def count(self) -> int:
        return len(self._records)

    def delete(self, dataset_id: str) -> None:
        record = self.get(dataset_id)
        with self._lock:
            self._records.pop(record.id, None)
        if self.persist:
            for suffix in (".frame.json", ".probs.npy", ".state.json"):
                path = self.directory / f"{record.id}{suffix}"
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("Could not delete %s", path)

    # ----------------------------------------------------------- persistence
    def save(self, record: DatasetRecord, *, frame: bool = False, probabilities: bool = False) -> None:
        if not self.persist:
            return
        try:
            with record.lock:
                if frame:
                    columns = [str(c) for c in record.frame.columns]
                    self._write_json(
                        self.directory / f"{record.id}.frame.json",
                        {
                            "columns": columns,
                            "data": [list(r.values()) for r in record.records()],
                            "profiles": record.profiles,
                        },
                    )
                if probabilities:
                    path = self.directory / f"{record.id}.probs.npy"
                    if record.probabilities is None:
                        path.unlink(missing_ok=True)
                    else:
                        tmp = path.with_suffix(".tmp")
                        with open(tmp, "wb") as handle:
                            np.save(handle, record.probabilities, allow_pickle=False)
                        os.replace(tmp, path)
                self._write_json(self.directory / f"{record.id}.state.json", self._state(record))
        except OSError:
            logger.exception("Failed to persist dataset %s", record.id)

    def load_all(self, rebuild: Callable[[DatasetRecord], None] | None = None) -> int:
        if not self.persist:
            return 0
        loaded = 0
        for state_path in sorted(self.directory.glob("*.state.json")):
            dataset_id = state_path.name.split(".")[0]
            if not _ID_PATTERN.match(dataset_id):
                continue
            try:
                record = self._load(dataset_id)
            except Exception:  # noqa: BLE001 - a corrupt snapshot must not stop the API
                logger.exception("Skipping unreadable dataset snapshot %s", dataset_id)
                continue
            if rebuild is not None:
                try:
                    rebuild(record)
                except Exception:  # noqa: BLE001
                    logger.exception("Could not rebuild results for dataset %s", dataset_id)
            self._records[record.id] = record
            loaded += 1
        return loaded

    @staticmethod
    def _state(record: DatasetRecord) -> dict[str, Any]:
        return {
            "version": 1,
            "id": record.id,
            "name": record.name,
            "source": record.source,
            "filename": record.filename,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "target_column": record.target_column,
            "category_order": record.category_order,
            "categories": list(record.encoding.categories) if record.encoding else None,
            "probability_sources": record.probability_sources,
            "scenarios": record.scenarios,
            "probability_meta": record.probability_meta,
            "confusables": record.confusables,
            "confusables_column": record.confusables_column,
            "decode_config": record.decode_config.to_dict() if record.decode_config else None,
            "decoded_at": record.decoded_at,
            "reviews": [asdict(r) for r in record.reviews.values()],
            "audit": [asdict(a) for a in record.audit],
        }

    def _load(self, dataset_id: str) -> DatasetRecord:
        state = json.loads((self.directory / f"{dataset_id}.state.json").read_text("utf-8"))
        frame_doc = json.loads((self.directory / f"{dataset_id}.frame.json").read_text("utf-8"))
        frame = pd.DataFrame(frame_doc["data"], columns=frame_doc["columns"])
        probs_path = self.directory / f"{dataset_id}.probs.npy"
        probabilities = np.load(probs_path, allow_pickle=False) if probs_path.exists() else None
        record = DatasetRecord(
            id=state["id"],
            name=state["name"],
            source=state["source"],
            filename=state.get("filename"),
            frame=frame,
            profiles=frame_doc["profiles"],
            created_at=state["created_at"],
            updated_at=state["updated_at"],
            target_column=state.get("target_column"),
            category_order=state.get("category_order", "appearance"),
            encoding=CategoryEncoding(tuple(state["categories"])) if state.get("categories") else None,
            probabilities=probabilities,
            probability_sources=state.get("probability_sources"),
            scenarios=state.get("scenarios"),
            probability_meta=state.get("probability_meta") or {},
            confusables=state.get("confusables"),
            confusables_column=state.get("confusables_column"),
            decode_config=DecodeConfig(**state["decode_config"]) if state.get("decode_config") else None,
            decoded_at=state.get("decoded_at"),
            reviews={int(r["row_id"]): ReviewRecord(**r) for r in state.get("reviews", [])},
            audit=[AuditRecord(**a) for a in state.get("audit", [])],
        )
        return record

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
        os.replace(tmp, path)
