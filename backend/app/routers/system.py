"""Health and settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core import MAX_TOP_K, DecodeConfig
from app.dependencies import Container, get_container
from app.models.common import DecodeSettings
from app.models.misc import HealthOut, SettingsOut
from app.utils.serialization import utc_now

router = APIRouter(tags=["system"])


def _settings_out(container: Container) -> dict:
    s = container.settings
    return {
        "decode": container.decode_settings.get().to_dict(),
        "defaults": container.decode_settings.defaults.to_dict(),
        "gemini": container.gemini.status(),
        "limits": {
            "max_upload_mb": s.max_upload_mb,
            "max_rows": s.max_rows,
            "max_columns": s.max_columns,
            "max_categories": s.max_categories,
            "max_top_k": MAX_TOP_K,
            "probability_sum_tolerance": s.probability_sum_tolerance,
        },
    }


@router.get("/health", response_model=HealthOut)
def health(container: Container = Depends(get_container)) -> dict:
    s = container.settings
    return {
        "status": "ok",
        "app": s.app_name,
        "version": s.app_version,
        "environment": s.environment,
        "time": utc_now(),
        "gemini_configured": container.gemini.configured,
        "datasets": container.store.count(),
    }


@router.get("/settings", response_model=SettingsOut)
def get_settings(container: Container = Depends(get_container)) -> dict:
    return _settings_out(container)


@router.put("/settings", response_model=SettingsOut)
def update_settings(body: DecodeSettings, container: Container = Depends(get_container)) -> dict:
    container.decode_settings.update(DecodeConfig(**body.model_dump()))
    return _settings_out(container)


@router.post("/settings/reset", response_model=SettingsOut)
def reset_settings(container: Container = Depends(get_container)) -> dict:
    container.decode_settings.reset()
    return _settings_out(container)
