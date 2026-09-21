"""Dataset pipeline: column selection -> probability vectors -> safe decoding."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd

from app.config import Settings
from app.core import (
    CategoryEncoding,
    DecodeConfig,
    EncoderService,
    MalformedProbabilityError,
    SafeDecoder,
    validate_matrix,
)
from app.utils.errors import InputValidationError, PipelineStateError
from app.utils.serialization import utc_now

from .simulation_service import DEFAULT_MIX, SCENARIOS, ProbabilitySimulator, _normalise_mix
from .store import DatasetRecord, DatasetStore

if TYPE_CHECKING:
    from .gemini_service import GeminiService


def require_encoding(record: DatasetRecord) -> CategoryEncoding:
    if record.encoding is None or record.target_column is None:
        raise PipelineStateError(
            "Select a categorical column for this dataset first.", code="NO_CATEGORICAL_COLUMN"
        )
    return record.encoding


def require_probabilities(record: DatasetRecord) -> np.ndarray:
    require_encoding(record)
    if record.probabilities is None:
        raise PipelineStateError(
            "Generate or import probability vectors before decoding.", code="NO_PROBABILITIES"
        )
    return record.probabilities


def require_results(record: DatasetRecord) -> list:
    require_probabilities(record)
    if record.results is None:
        raise PipelineStateError("Run safe decoding on this dataset first.", code="NOT_DECODED")
    return record.results


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.casefold()).strip("_")


def suggest_probability_columns(record: DatasetRecord) -> dict[str, str]:
    if record.encoding is None:
        return {}
    numeric = [p["name"] for p in record.profiles if p["dtype"] in ("integer", "float")]
    by_norm = {_norm(c): c for c in numeric}
    suggestions: dict[str, str] = {}
    for category in record.encoding.categories:
        n = _norm(category)
        for candidate in (f"p_{n}", f"prob_{n}", f"probability_{n}", f"{n}_prob", f"{n}_probability", n):
            if candidate in by_norm:
                suggestions[category] = by_norm[candidate]
                break
    return suggestions


class PipelineService:
    def __init__(self, store: DatasetStore, settings: Settings) -> None:
        self.store = store
        self.settings = settings

    # ----------------------------------------------------------- step 1: column
    def select_column(self, record: DatasetRecord, column: str, order: str = "appearance") -> CategoryEncoding:
        if column not in record.frame.columns:
            raise InputValidationError(
                f"Column '{column}' does not exist in this dataset.",
                code="MISSING_CATEGORICAL_COLUMN",
                details={"available_columns": [str(c) for c in record.frame.columns]},
            )
        encoder = EncoderService(order=order, max_categories=self.settings.max_categories)  # type: ignore[arg-type]
        encoding = encoder.fit(record.frame[column].tolist())
        with record.lock:
            record.target_column = column
            record.category_order = order
            record.encoding = encoding
            record.reset_labels()
            self._clear_probabilities(record)
            record.touch()
        self.store.save(record, probabilities=True)
        return encoding

    # ---------------------------------------------------- step 2: probabilities
    def simulate(
        self, record: DatasetRecord, seed: int | None = None, mix: Mapping[str, float] | None = None
    ) -> None:
        encoding = require_encoding(record)
        confusables = record.confusables if record.confusables_column == record.target_column else None
        simulator = ProbabilitySimulator(seed)
        try:
            weights = _normalise_mix(dict(mix) if mix is not None else None)
            output = simulator.generate_for_labels(record.labels(), encoding, weights, confusables)
        except ValueError as exc:
            raise InputValidationError(str(exc), code="INVALID_SCENARIO_MIX") from exc
        matrix = validate_matrix(output.probabilities, encoding.size, tolerance=self.settings.probability_sum_tolerance)
        self._set_probabilities(
            record,
            matrix,
            sources=["simulated"] * record.row_count,
            scenarios=output.scenarios,
            meta={
                "source": "simulated",
                "seed": output.seed,
                "mix": {k: round(v, 4) for k, v in weights.items()},
                "generated_at": utc_now(),
            },
        )

    def import_columns(self, record: DatasetRecord, mapping: Mapping[str, str], normalize: bool) -> None:
        encoding = require_encoding(record)
        unknown = sorted(set(mapping) - set(encoding.categories))
        if unknown:
            raise InputValidationError(
                f"Unknown categories in mapping: {', '.join(unknown)}.",
                code="UNKNOWN_CATEGORY",
                details={"unknown": unknown},
            )
        missing = [c for c in encoding.categories if c not in mapping]
        if missing:
            raise InputValidationError(
                f"Map a probability column for every category. Missing: {', '.join(missing)}.",
                code="MISSING_CATEGORIES",
                details={"missing": missing},
            )
        columns = [mapping[c] for c in encoding.categories]
        absent = [c for c in columns if c not in record.frame.columns]
        if absent:
            raise InputValidationError(
                f"Columns not found in dataset: {', '.join(absent)}.", code="MISSING_COLUMN"
            )
        if len(set(columns)) != len(columns):
            raise InputValidationError(
                "Each category must map to a different column.", code="DUPLICATE_COLUMN"
            )
        block = record.frame[columns].apply(pd.to_numeric, errors="coerce")
        null_mask = block.isna().to_numpy()
        if null_mask.any():
            row, col = map(int, np.argwhere(null_mask)[0])
            raise MalformedProbabilityError(
                f"Row {row + 1}: column '{columns[col]}' is empty or not a number.",
                details={"row": row + 1, "column": columns[col]},
            )
        matrix = validate_matrix(
            block.to_numpy(dtype=np.float64),
            encoding.size,
            normalize=normalize,
            tolerance=self.settings.probability_sum_tolerance,
        )
        self._set_probabilities(
            record,
            matrix,
            sources=["uploaded"] * record.row_count,
            scenarios=None,
            meta={"source": "uploaded", "columns": dict(mapping), "normalized": normalize, "generated_at": utc_now()},
        )

    def apply_gemini(
        self, record: DatasetRecord, gemini: GeminiService, text_column: str, max_rows: int | None
    ) -> int:
        encoding = require_encoding(record)
        if text_column not in record.frame.columns:
            raise InputValidationError(
                f"Column '{text_column}' does not exist in this dataset.", code="MISSING_COLUMN"
            )
        limit = min(max_rows or self.settings.gemini_max_rows, self.settings.gemini_max_rows, record.row_count)
        texts = ["" if v is None else str(v) for v in record.frame[text_column].tolist()[:limit]]
        scored = gemini.score_texts(texts, encoding.categories)

        if record.probabilities is not None:
            matrix = record.probabilities.copy()
            sources = list(record.probability_sources or ["simulated"] * record.row_count)
            scenarios = list(record.scenarios) if record.scenarios else None
        else:
            # Rows beyond the Gemini limit fall back to the local simulator.
            simulator = ProbabilitySimulator(None)
            output = simulator.generate_for_labels(record.labels(), encoding, dict(DEFAULT_MIX))
            matrix, sources, scenarios = output.probabilities, ["simulated"] * record.row_count, output.scenarios
        for i, (_, vector) in enumerate(scored):
            matrix[i] = vector
            sources[i] = "gemini"
            if scenarios is not None:
                scenarios[i] = "gemini"
        matrix = validate_matrix(matrix, encoding.size, tolerance=self.settings.probability_sum_tolerance)
        self._set_probabilities(
            record,
            matrix,
            sources=sources,
            scenarios=scenarios,
            meta={
                "source": "gemini" if limit == record.row_count else "mixed",
                "gemini_rows": limit,
                "text_column": text_column,
                "model": gemini.config.model,
                "generated_at": utc_now(),
            },
        )
        return limit

    # --------------------------------------------------------- step 3: decode
    def decode(self, record: DatasetRecord, config: DecodeConfig) -> None:
        encoding = require_encoding(record)
        probabilities = require_probabilities(record)
        decoder = SafeDecoder(config, sum_tolerance=self.settings.probability_sum_tolerance)
        results = decoder.decode_validated(probabilities, encoding.categories)
        with record.lock:
            record.results = results
            record.decode_config = config
            record.decoded_at = utc_now()
            record.touch()
        self.store.save(record)

    def rebuild(self, record: DatasetRecord) -> None:
        """Recompute results after loading a snapshot."""
        if record.encoding is None or record.probabilities is None or record.decode_config is None:
            return
        if record.decoded_at is None:
            return
        decoder = SafeDecoder(record.decode_config, sum_tolerance=self.settings.probability_sum_tolerance)
        record.results = decoder.decode_validated(record.probabilities, record.encoding.categories)

    # ---------------------------------------------------------------- helpers
    def _set_probabilities(
        self,
        record: DatasetRecord,
        matrix: np.ndarray,
        *,
        sources: list[str],
        scenarios: list[str] | None,
        meta: dict[str, Any],
    ) -> None:
        with record.lock:
            record.probabilities = matrix
            record.probability_sources = sources
            record.scenarios = scenarios
            record.probability_meta = meta
            self._clear_results(record)
            record.touch()
        self.store.save(record, probabilities=True)

    @staticmethod
    def _clear_probabilities(record: DatasetRecord) -> None:
        record.probabilities = None
        record.probability_sources = None
        record.scenarios = None
        record.probability_meta = {}
        PipelineService._clear_results(record)

    @staticmethod
    def _clear_results(record: DatasetRecord) -> None:
        # Manual decisions refer to specific vectors, so they are cleared when the
        # vectors change. The audit log is kept as history.
        record.results = None
        record.decoded_at = None
        record.reviews = {}


__all__ = [
    "SCENARIOS",
    "PipelineService",
    "require_encoding",
    "require_probabilities",
    "require_results",
    "suggest_probability_columns",
]
