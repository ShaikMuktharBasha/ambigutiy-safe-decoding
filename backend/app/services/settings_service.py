"""Global decoder settings (persisted so the Settings page survives restarts)."""

from __future__ import annotations

import json
import logging
import threading

from app.config import Settings
from app.core import DecodeConfig, DecodingMode

logger = logging.getLogger(__name__)


class SettingsService:
    def __init__(self, settings: Settings) -> None:
        self._lock = threading.Lock()
        self.defaults = DecodeConfig(
            confidence_threshold=settings.default_confidence_threshold,
            near_tie_threshold=settings.default_near_tie_threshold,
            mode=DecodingMode(settings.default_mode),
            top_k=settings.default_top_k,
        )
        self.path = settings.storage_dir / "settings.json" if settings.persist_state else None
        self._config = self._load() or self.defaults

    def get(self) -> DecodeConfig:
        return self._config

    def update(self, config: DecodeConfig) -> DecodeConfig:
        with self._lock:
            self._config = config
            self._save()
        return config

    def reset(self) -> DecodeConfig:
        return self.update(self.defaults)

    def resolve(
        self,
        confidence_threshold: float | None = None,
        near_tie_threshold: float | None = None,
        mode: str | None = None,
        top_k: int | None = None,
    ) -> DecodeConfig:
        """Merge per-request overrides with the saved settings."""
        base = self._config
        return DecodeConfig(
            confidence_threshold=base.confidence_threshold if confidence_threshold is None else confidence_threshold,
            near_tie_threshold=base.near_tie_threshold if near_tie_threshold is None else near_tie_threshold,
            mode=base.mode if mode is None else DecodingMode(mode),
            top_k=base.top_k if top_k is None else top_k,
        )

    def _load(self) -> DecodeConfig | None:
        if self.path is None or not self.path.exists():
            return None
        try:
            return DecodeConfig(**json.loads(self.path.read_text("utf-8")))
        except Exception:  # noqa: BLE001
            logger.warning("Ignoring unreadable settings file %s", self.path)
            return None

    def _save(self) -> None:
        if self.path is None:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._config.to_dict(), indent=2), encoding="utf-8")
        except OSError:
            logger.exception("Could not save settings")
