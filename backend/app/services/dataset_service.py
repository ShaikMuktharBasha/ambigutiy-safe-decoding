"""Upload parsing, validation and column profiling.

Uploaded files are only ever *parsed* as data (pandas CSV reader / openpyxl);
they are never written to disk under their original name or executed.
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import PurePath
from typing import Any

import pandas as pd
from pandas.api import types as ptypes

from app.config import Settings
from app.utils.errors import PayloadTooLargeError, UploadValidationError

from .simulation_service import build_demo_frame
from .store import DatasetRecord, DatasetStore

ALLOWED_EXTENSIONS = {".csv": "csv", ".xlsx": "xlsx"}

_ID_LIKE = re.compile(r"(^id$|_id$|^id_|uuid|guid)", re.IGNORECASE)
_CATEGORY_HINT = re.compile(r"(type|category|class|label|segment|group|genre|kind|tier)", re.IGNORECASE)


def validate_upload_name(filename: str | None) -> str:
    if not filename:
        raise UploadValidationError("The upload has no filename.", code="INVALID_FILE")
    suffix = PurePath(PurePath(filename).name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            f"Unsupported file type '{suffix or 'none'}'. Upload a .csv or .xlsx file.",
            code="UNSUPPORTED_FILE_TYPE",
        )
    return ALLOWED_EXTENSIONS[suffix]


def parse_file(filename: str, content: bytes, settings: Settings) -> pd.DataFrame:
    kind = validate_upload_name(filename)
    if not content:
        raise UploadValidationError("The uploaded file is empty.", code="EMPTY_FILE")
    if len(content) > settings.max_upload_bytes:
        raise PayloadTooLargeError(f"The file exceeds the {settings.max_upload_mb:g} MB upload limit.")

    frame = _parse_csv(content) if kind == "csv" else _parse_xlsx(content)
    frame = _clean_frame(frame)

    if frame.shape[1] == 0:
        raise UploadValidationError("No columns were found in the file.", code=f"INVALID_{kind.upper()}")
    if frame.shape[0] == 0:
        raise UploadValidationError("The file has a header row but no data rows.", code="EMPTY_DATASET")
    if frame.shape[1] > settings.max_columns:
        raise UploadValidationError(
            f"The file has {frame.shape[1]} columns; the limit is {settings.max_columns}.",
            code="TOO_MANY_COLUMNS",
        )
    if frame.shape[0] > settings.max_rows:
        raise UploadValidationError(
            f"The file has {frame.shape[0]:,} rows; the limit is {settings.max_rows:,}.",
            code="TOO_MANY_ROWS",
        )
    return frame


def _parse_csv(content: bytes) -> pd.DataFrame:
    if b"\x00" in content[:4096]:
        raise UploadValidationError(
            "This does not look like a CSV text file (binary content detected).", code="INVALID_CSV"
        )
    text = ""
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    try:
        delimiter = csv.Sniffer().sniff(text[:16384], delimiters=",;\t|").delimiter
    except csv.Error:
        delimiter = ","
    try:
        return pd.read_csv(io.StringIO(text), sep=delimiter, skipinitialspace=True)
    except pd.errors.EmptyDataError as exc:
        raise UploadValidationError("The CSV file contains no data.", code="INVALID_CSV") from exc
    except (pd.errors.ParserError, ValueError, csv.Error) as exc:
        first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else "malformed content"
        raise UploadValidationError(
            f"Could not parse the CSV file: {first_line}", code="INVALID_CSV"
        ) from exc


def _parse_xlsx(content: bytes) -> pd.DataFrame:
    if not content.startswith(b"PK\x03\x04"):
        raise UploadValidationError("This file is not a valid .xlsx workbook.", code="INVALID_XLSX")
    try:
        return pd.read_excel(io.BytesIO(content), engine="openpyxl", sheet_name=0)
    except Exception as exc:  # noqa: BLE001 - openpyxl raises many unrelated types
        raise UploadValidationError(
            "Could not read the .xlsx workbook. Check that it is a valid, unencrypted Excel file.",
            code="INVALID_XLSX",
        ) from exc


def _clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    empty_unnamed = [
        c for c in frame.columns if str(c).startswith("Unnamed:") and frame[c].isna().all()
    ]
    frame = frame.drop(columns=empty_unnamed).dropna(axis=0, how="all").reset_index(drop=True)

    names: list[str] = []
    seen: set[str] = set()
    for position, column in enumerate(frame.columns, start=1):
        base = str(column).strip()
        if not base or base.startswith("Unnamed:"):
            base = f"column_{position}"
        name, suffix = base, 2
        while name in seen:
            name, suffix = f"{base}_{suffix}", suffix + 1
        seen.add(name)
        names.append(name)
    frame.columns = names

    for column in frame.columns:
        series = frame[column]
        if ptypes.is_object_dtype(series) or ptypes.is_string_dtype(series):
            frame[column] = series.map(lambda v: (v.strip() or None) if isinstance(v, str) else v)
    return frame


# --------------------------------------------------------------------- profiling
def _dtype_of(series: pd.Series) -> str:
    if ptypes.is_bool_dtype(series):
        return "boolean"
    if ptypes.is_integer_dtype(series):
        return "integer"
    if ptypes.is_float_dtype(series):
        values = series.dropna()
        if len(values) and bool((values % 1 == 0).all()):
            return "integer"
        return "float"
    if ptypes.is_datetime64_any_dtype(series):
        return "datetime"
    values = series.dropna()
    if len(values) and all(isinstance(v, bool) for v in values):
        return "boolean"
    return "text"


def _categorical_verdict(
    name: str, dtype: str, unique: int, non_null: int, ratio: float, max_categories: int
) -> tuple[bool, str]:
    if non_null == 0:
        return False, "Column is empty"
    if unique < 2:
        return False, "Only one distinct value"
    if unique > max_categories:
        return False, f"{unique} distinct values (limit {max_categories})"
    if _ID_LIKE.search(name):
        return False, "Looks like an identifier"
    if dtype == "boolean":
        return True, "Boolean values"
    if dtype == "datetime":
        return False, "Date/time values"
    if dtype == "float":
        return False, "Continuous numeric values"
    if dtype == "integer":
        if unique <= 10 and ratio <= 0.5:
            return True, f"{unique} distinct integer codes"
        return False, "Numeric values"
    if unique == non_null and non_null > 20:
        return False, "Every value is unique"
    if ratio <= 0.5 or non_null <= 20:
        return True, f"{unique} distinct values"
    return False, f"Too many distinct values for the row count ({ratio:.0%})"


def profile_columns(frame: pd.DataFrame, max_categories: int) -> list[dict[str, Any]]:
    total = len(frame)
    profiles: list[dict[str, Any]] = []
    for column in frame.columns:
        series = frame[column]
        dtype = _dtype_of(series)
        non_null_values = series.dropna()
        as_text = non_null_values.map(lambda v: str(v).strip())
        as_text = as_text[as_text != ""]
        non_null = int(len(as_text))
        counts = as_text.value_counts()
        unique = int(counts.size)
        ratio = unique / non_null if non_null else 0.0
        is_categorical, reason = _categorical_verdict(
            str(column), dtype, unique, non_null, ratio, max_categories
        )
        profiles.append(
            {
                "name": str(column),
                "dtype": dtype,
                "non_null": non_null,
                "null_count": total - non_null,
                "unique_count": unique,
                "unique_ratio": round(ratio, 4),
                "is_categorical": is_categorical,
                "categorical_reason": reason,
                "sample_values": [str(v) for v in as_text.drop_duplicates().head(5)],
                "top_values": [{"value": str(k), "count": int(v)} for k, v in counts.head(5).items()],
            }
        )
    return profiles


def suggest_column(profiles: list[dict[str, Any]]) -> str | None:
    candidates = [p for p in profiles if p["is_categorical"]]
    if not candidates:
        return None

    def score(profile: dict[str, Any]) -> tuple[int, int, int]:
        return (
            1 if _CATEGORY_HINT.search(profile["name"]) else 0,
            1 if profile["dtype"] == "text" else 0,
            -abs(profile["unique_count"] - 5),
        )

    return max(candidates, key=score)["name"]


# ------------------------------------------------------------------- creation
def create_upload_dataset(
    store: DatasetStore, filename: str, content: bytes, settings: Settings
) -> DatasetRecord:
    frame = parse_file(filename, content, settings)
    safe_name = PurePath(filename).name
    record = DatasetRecord(
        id=DatasetRecord.new_id(),
        name=PurePath(safe_name).stem[:80] or "dataset",
        source="upload",
        filename=safe_name[:200],
        frame=frame,
        profiles=profile_columns(frame, settings.max_categories),
    )
    return store.add(record)


def create_demo_dataset(store: DatasetStore, settings: Settings, rows: int, seed: int) -> DatasetRecord:
    frame, confusables = build_demo_frame(rows=rows, seed=seed)
    record = DatasetRecord(
        id=DatasetRecord.new_id(),
        name="Demo product catalogue",
        source="demo",
        filename=None,
        frame=frame,
        profiles=profile_columns(frame, settings.max_categories),
        confusables=confusables,
        confusables_column="product_type",
    )
    return store.add(record)
