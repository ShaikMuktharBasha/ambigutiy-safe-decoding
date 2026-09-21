"""Runtime-editable Gemini configuration.

The API key and model can be set two ways:

* ``GEMINI_API_KEY`` / ``GEMINI_MODEL`` in ``backend/.env`` (loaded once at
  startup via :class:`app.config.Settings`), or
* directly from the Settings page in the UI, via ``PUT /api/gemini/config``.

A value set from the UI is stored in ``storage/gemini.json`` (gitignored,
same as the other local JSON state such as ``settings.json``) and takes
precedence over the environment variable; clearing it falls back to the
environment value, if any. Like the environment variable, this file holds the
key in plain text - acceptable for the local/dev use this project targets,
but it is never returned to the frontend: only whether a key is configured
and a short preview (first/last few characters) are exposed.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, replace
from typing import Literal

from app.config import Settings

logger = logging.getLogger(__name__)

# A small, curated set of current Gemini models suitable for this demo's
# lightweight classification calls. The UI also accepts any other model name.
GEMINI_MODEL_CHOICES: tuple[str, ...] = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
)

ConfigSource = Literal["settings", "environment", "none"]


@dataclass(frozen=True)
class _RuntimeOverride:
    api_key: str = ""
    model: str = ""


class GeminiConfigService:
    """Holds the effective Gemini API key and model, editable at runtime."""

    def __init__(self, settings: Settings) -> None:
        self._lock = threading.Lock()
        self._settings = settings
        self.path = settings.storage_dir / "gemini.json" if settings.persist_state else None
        self._runtime = self._load() or _RuntimeOverride()

    # ------------------------------------------------------------- effective
    @property
    def api_key(self) -> str:
        return self._runtime.api_key or self._settings.gemini_api_key

    @property
    def model(self) -> str:
        return self._runtime.model or self._settings.gemini_model

    @property
    def configured(self) -> bool:
        return bool(self.api_key.strip())

    @property
    def source(self) -> ConfigSource:
        if self._runtime.api_key:
            return "settings"
        if self._settings.gemini_api_key:
            return "environment"
        return "none"

    @property
    def model_is_custom(self) -> bool:
        """Whether the model was overridden from the Settings page."""
        return bool(self._runtime.model)

    def key_preview(self) -> str | None:
        key = self.api_key.strip()
        if not key:
            return None
        if len(key) <= 8:
            return "••••"
        return f"{key[:4]}••••{key[-4:]}"

    # ---------------------------------------------------------------- writes
    def set_api_key(self, api_key: str) -> None:
        with self._lock:
            self._runtime = replace(self._runtime, api_key=api_key.strip())
            self._save()

    def clear_api_key(self) -> None:
        self.set_api_key("")

    def set_model(self, model: str) -> None:
        with self._lock:
            self._runtime = replace(self._runtime, model=model.strip())
            self._save()

    def clear_model(self) -> None:
        self.set_model("")

    # ------------------------------------------------------------- persistence
    def _load(self) -> _RuntimeOverride | None:
        if self.path is None or not self.path.exists():
            return None
        try:
            data = json.loads(self.path.read_text("utf-8"))
            return _RuntimeOverride(api_key=str(data.get("api_key", "")), model=str(data.get("model", "")))
        except Exception:  # noqa: BLE001
            logger.warning("Ignoring unreadable Gemini config file %s", self.path)
            return None

    def _save(self) -> None:
        if self.path is None:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps({"api_key": self._runtime.api_key, "model": self._runtime.model}), encoding="utf-8"
            )
        except OSError:
            logger.exception("Could not save Gemini config")
