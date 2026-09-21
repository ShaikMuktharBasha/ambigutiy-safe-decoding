"""Application-level errors translated into JSON responses by ``app.main``."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class PipelineStateError(AppError):
    """The request is valid but the dataset is not at the right pipeline stage."""

    status_code = 409
    code = "PIPELINE_STATE"


class UploadValidationError(AppError):
    status_code = 400
    code = "INVALID_UPLOAD"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "FILE_TOO_LARGE"


class InputValidationError(AppError):
    status_code = 422
    code = "INVALID_INPUT"


class ProviderNotConfiguredError(AppError):
    status_code = 503
    code = "PROVIDER_NOT_CONFIGURED"


class UpstreamProviderError(AppError):
    status_code = 502
    code = "UPSTREAM_PROVIDER_ERROR"
