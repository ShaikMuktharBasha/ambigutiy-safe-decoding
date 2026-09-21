"""FastAPI application factory.

Run with::

    uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.core import DecodingError
from app.dependencies import build_container
from app.routers import api_router
from app.utils.errors import AppError

logger = logging.getLogger("asid")


def _error(status: int, code: str, message: str, details: object | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": jsonable_encoder(details)}},
    )


def _validation_code(fields: list[str]) -> str:
    joined = " ".join(fields)
    if "probabilities" in joined:
        return "MALFORMED_PROBABILITY_VECTOR"
    if "threshold" in joined or "top_k" in joined or "mode" in joined:
        return "INVALID_THRESHOLD"
    if "categories" in joined:
        return "INVALID_CATEGORIES"
    if "file" in joined:
        return "INVALID_UPLOAD"
    return "VALIDATION_ERROR"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(DecodingError)
    async def _decoding_error(_: Request, exc: DecodingError) -> JSONResponse:
        return _error(422, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            details.append({"field": ".".join(loc), "message": err.get("msg", "Invalid value"), "type": err.get("type")})
        first = details[0] if details else {"field": "", "message": "Invalid request"}
        message = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
        return _error(422, _validation_code([d["field"] for d in details]), message, details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        return _error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return _error(500, "INTERNAL_ERROR", "An unexpected error occurred. Check the API logs for details.")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Safety-aware inverse decoding of one-hot / probability vectors. Replaces blind argmax "
            "with confidence checks, near-tie detection, top-k ranking and human review."
        ),
        docs_url=f"{settings.api_prefix}/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        redoc_url=None,
    )
    app.state.container = build_container(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
        expose_headers=["Content-Disposition"],
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"name": settings.app_name, "docs": f"{settings.api_prefix}/docs"}

    return app


app = create_app()
