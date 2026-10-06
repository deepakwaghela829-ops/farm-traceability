from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.crops import router as crops_router
from app.api.routes.transactions import router as transactions_router
from app.ai.routes import router as prediction_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Farm Traceability API",
    version="0.1.0",
    description="Initial Farmer Crop Entry micro-feature for the B.E. major project.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(crops_router)
app.include_router(transactions_router)
app.include_router(prediction_router)


@app.on_event("startup")
def startup_event():
    try:
        from app.ai.predictor import get_model, get_market_benchmarks
        get_model()
        get_market_benchmarks()
    except Exception:
        pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}