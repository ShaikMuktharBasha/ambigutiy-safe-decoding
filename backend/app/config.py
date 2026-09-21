"""Application configuration loaded from environment variables / ``.env``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Ambiguity-Safe Inverse Decoding"
    app_version: str = "1.0.0"
    environment: Literal["development", "production", "test"] = "development"
    api_prefix: str = "/api"

    # Comma-separated list of allowed browser origins, or * for all
    cors_origins: str = "*"

    # Upload limits
    max_upload_mb: float = Field(default=10.0, gt=0, le=200)
    max_rows: int = Field(default=50_000, gt=0)
    max_columns: int = Field(default=200, gt=0)
    max_categories: int = Field(default=50, ge=2, le=500)

    # State persistence (JSON snapshots so datasets survive a reload of the API)
    storage_dir: Path = BACKEND_ROOT / "storage"
    persist_state: bool = True

    # Decoder defaults
    default_confidence_threshold: float = Field(default=0.75, ge=0, le=1)
    default_near_tie_threshold: float = Field(default=0.05, ge=0, le=1)
    default_top_k: int = Field(default=3, ge=1, le=10)
    default_mode: Literal["strict", "soft", "advisory"] = "strict"
    probability_sum_tolerance: float = Field(default=1e-3, gt=0, le=0.1)

    # Optional Gemini provider (never exposed to the frontend)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_max_rows: int = Field(default=50, ge=1, le=1000)
    gemini_batch_size: int = Field(default=20, ge=1, le=100)
    gemini_timeout_seconds: float = Field(default=45.0, gt=0)

    @field_validator("storage_dir", mode="after")
    @classmethod
    def _resolve_storage(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BACKEND_ROOT / value).resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins or self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
