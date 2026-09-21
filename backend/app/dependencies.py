"""Service container wired once per application instance."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Request

from app.config import Settings
from app.services.gemini_config_service import GeminiConfigService
from app.services.gemini_service import GeminiService
from app.services.pipeline_service import PipelineService
from app.services.settings_service import SettingsService
from app.services.store import DatasetStore

logger = logging.getLogger(__name__)


@dataclass
class Container:
    settings: Settings
    store: DatasetStore
    pipeline: PipelineService
    decode_settings: SettingsService
    gemini_config: GeminiConfigService
    gemini: GeminiService


def build_container(settings: Settings) -> Container:
    store = DatasetStore(settings.storage_dir, persist=settings.persist_state)
    pipeline = PipelineService(store, settings)
    gemini_config = GeminiConfigService(settings)
    container = Container(
        settings=settings,
        store=store,
        pipeline=pipeline,
        decode_settings=SettingsService(settings),
        gemini_config=gemini_config,
        gemini=GeminiService(settings, gemini_config),
    )
    loaded = store.load_all(rebuild=pipeline.rebuild)
    if loaded:
        logger.info("Restored %d dataset(s) from %s", loaded, store.directory)
    return container


def get_container(request: Request) -> Container:
    return request.app.state.container
