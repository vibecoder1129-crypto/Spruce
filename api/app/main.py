import logging
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.booking.router import router as booking_router
from app.business.router import admin_router as business_admin_router
from app.business.router import router as business_router
from app.config import get_settings
from app.csrf import CSRFMiddleware
from app.db import get_session
from app.identity.router import me_router
from app.identity.router import router as auth_router
from app.logging import configure_logging
from app.marketplace.router import router as marketplace_router
from app.security import SecurityHeadersMiddleware
from app.team.router import router as team_router

log = logging.getLogger("spruce")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    is_prod = settings.env == "prod"
    app = FastAPI(
        title="Spruce API",
        version="0.1.0",
        # Interactive docs only outside production.
        docs_url=None if is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if is_prod else "/openapi.json",
    )
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Never echo internals to the client; the log line carries no request body.
        log.error("unhandled error", extra={"path": request.url.path}, exc_info=exc)
        return JSONResponse({"detail": "Something went wrong."}, status_code=500)

    @app.get("/health", tags=["ops"])
    async def health(session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, str]:
        await session.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(me_router)
    app.include_router(business_router)
    app.include_router(business_admin_router)
    app.include_router(team_router)
    app.include_router(booking_router)
    app.include_router(marketplace_router)
    return app


app = create_app()
