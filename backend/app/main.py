import logging
import os
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import (
    http_exception_handler as default_http_exception_handler,
    request_validation_exception_handler as default_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.crops import router as crops_router
from app.api.routes.transactions import router as transactions_router
from app.api.routes.blockchain import router as blockchain_router
from app.ai.routes import router as prediction_router
from app.config import get_settings
from app.db import check_database_health

logger = logging.getLogger("app.main")
settings = get_settings()

app = FastAPI(
    title="Farm Traceability API",
    version="0.1.0",
    description="AgriTrace OS - Farm-to-Consumer Traceability micro-service.",
)

# 1. Allowed origins: explicitly include production frontend and dev origins
allowed_origins = [
    "https://frontend-tau-three-20.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    *settings.cors_origins,
]
origins = list(dict.fromkeys([o.rstrip("/") for o in allowed_origins if o.strip()]))

# 2. CORS middleware configured before API routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


@app.middleware("http")
async def ensure_cors_headers_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(
            "Unhandled exception in request pipeline for %s %s: %s",
            request.method,
            request.url.path,
            exc,
            exc_info=True,
        )
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    if origin and (origin in origins or origin.rstrip("/") in origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        )
    return response


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    response = await default_http_exception_handler(request, exc)
    origin = request.headers.get("origin")
    if origin and (origin in origins or origin.rstrip("/") in origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.exception_handler(RequestValidationError)
async def custom_validation_exception_handler(request: Request, exc: RequestValidationError):
    response = await default_validation_exception_handler(request, exc)
    origin = request.headers.get("origin")
    if origin and (origin in origins or origin.rstrip("/") in origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Global exception caught: %s", exc, exc_info=True)
    origin = request.headers.get("origin")
    headers = {}
    if origin and (origin in origins or origin.rstrip("/") in origins):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.include_router(auth_router)
app.include_router(crops_router)
app.include_router(transactions_router)
app.include_router(blockchain_router)
app.include_router(prediction_router)


@app.on_event("startup")
def startup_event():
    is_serverless = bool(os.getenv("VERCEL"))
    sync_requested = os.getenv("SYNC_DEMO_ACCOUNTS", "").strip().lower() in ("true", "1", "yes")

    if is_serverless:
        # On serverless (Vercel): prevent latency spikes and cold-start timeouts.
        # Skip repeated Base.metadata.create_all and synchronous AI model loading.
        # Only perform explicit demo account synchronization when specifically requested.
        if sync_requested:
            try:
                from app.db import PrimarySessionLocal, _db_url
                if not _db_url.startswith("sqlite"):
                    with PrimarySessionLocal() as session:
                        from app.seed_demo_users import sync_designated_demo_users
                        sync_res = sync_designated_demo_users(session)
                        logger.info("Serverless demo accounts synchronized: %s", sync_res)
            except Exception as exc:
                logger.warning("Serverless demo account sync notice: %s", exc)
        return

    # Local development & viva environment initialization
    try:
        from app.db import Base, ensure_crop_pricing_columns, primary_engine, PrimarySessionLocal
        Base.metadata.create_all(bind=primary_engine, checkfirst=True)
        ensure_crop_pricing_columns(primary_engine)
        from app.seed_demo_users import seed_users
        seed_users(target_engine=primary_engine, target_sessionmaker=PrimarySessionLocal, sync_passwords=sync_requested)
    except Exception as exc:
        logger.warning("Primary database local startup notice: %s", exc)

    try:
        from app.db import Base, ensure_crop_pricing_columns, fallback_engine, FallbackSessionLocal
        Base.metadata.create_all(bind=fallback_engine, checkfirst=True)
        ensure_crop_pricing_columns(fallback_engine)
        from app.seed_demo_users import seed_users
        seed_users(target_engine=fallback_engine, target_sessionmaker=FallbackSessionLocal, sync_passwords=sync_requested)
    except Exception as exc:
        logger.warning("Fallback database local startup notice: %s", exc)


@app.get("/health")
def health() -> dict:
    db_health = check_database_health()
    return {
        "status": "ok" if db_health.get("connected") else "degraded",
        "service": "AgriTrace OS Backend",
        "database": db_health,
    }
