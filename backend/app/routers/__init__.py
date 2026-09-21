from fastapi import APIRouter

from . import datasets, decode, gemini, results, system

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(datasets.router)
api_router.include_router(decode.router)
api_router.include_router(results.router)
api_router.include_router(gemini.router)

__all__ = ["api_router"]
