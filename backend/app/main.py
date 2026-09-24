from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.crops import router as crops_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Farm Traceability API",
    version="0.1.0",
    description="Initial Farmer Crop Entry micro-feature for the B.E. major project.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(crops_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
