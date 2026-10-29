from collections.abc import Generator
import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger("app.db")


class Base(DeclarativeBase):
    pass


settings = get_settings()
_db_url = settings.normalized_database_url

# Supabase transaction-pooler connections (port 6543) are designed for serverless
# functions. Use one connection per unit of work and disable psycopg prepared
# statements, which are not supported by transaction mode.
_is_transaction_pooler = ":6543/" in _db_url
_engine_kwargs = {"pool_pre_ping": True}

if _db_url.startswith("sqlite"):
    # SQLite alone uses check_same_thread=False
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL / Supabase: use valid psycopg connection arguments and SSL settings
    pg_connect_args = {}
    if _is_transaction_pooler:
        _engine_kwargs["poolclass"] = NullPool
        pg_connect_args["prepare_threshold"] = None
        pg_connect_args["sslmode"] = "require"
    elif "supabase" in _db_url.lower() or os.getenv("VERCEL") or "sslmode=require" in _db_url.lower():
        pg_connect_args["sslmode"] = "require"

    if pg_connect_args:
        _engine_kwargs["connect_args"] = pg_connect_args

primary_engine = create_engine(_db_url, **_engine_kwargs)
PrimarySessionLocal = sessionmaker(bind=primary_engine, autocommit=False, autoflush=False, expire_on_commit=False)

# Backward-compatible primary aliases
engine = primary_engine
SessionLocal = PrimarySessionLocal

# Resilient SQLite fallback engine for high availability when cloud database is paused or unreachable
BACKEND_DIR = Path(__file__).resolve().parent.parent
if os.getenv("VERCEL"):
    SQLITE_PATH = Path("/tmp/farm_traceability.db")
else:
    SQLITE_PATH = BACKEND_DIR / "farm_traceability.db"

fallback_engine = create_engine(
    f"sqlite:///{SQLITE_PATH}",
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)
FallbackSessionLocal = sessionmaker(bind=fallback_engine, autocommit=False, autoflush=False, expire_on_commit=False)


def ensure_crop_pricing_columns(target_engine) -> None:
    """Ensure pricing workflow and retail inventory columns exist on crops table across PostgreSQL and SQLite."""
    try:
        with target_engine.connect() as conn:
            dialect = target_engine.dialect.name
            if dialect == "postgresql":
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS farmer_price_per_kg NUMERIC(10, 2);"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS supplier_margin_per_kg NUMERIC(10, 2) DEFAULT 15.00;"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS supplier_price_per_kg NUMERIC(10, 2);"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retail_price_per_kg NUMERIC(10, 2);"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retailer_markup_per_kg NUMERIC(10, 2) DEFAULT 30.00;"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retail_confirmed_by VARCHAR(64);"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retail_confirmed_at TIMESTAMP WITH TIME ZONE;"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retailer_received_at TIMESTAMP WITH TIME ZONE;"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS retailer_received_by VARCHAR(64);"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE crops ADD COLUMN IF NOT EXISTS batch_number VARCHAR(32);"))
                conn.execute(text("UPDATE crops SET batch_number = 'BATCH-2026-' || LPAD(crop_id::text, 5, '0') WHERE batch_number IS NULL OR batch_number = '';"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_crops_batch_number ON crops(batch_number);"))
                conn.commit()
            elif dialect == "sqlite":
                result = conn.execute(text("PRAGMA table_info(crops)")).fetchall()
                existing_cols = {row[1] for row in result}
                if existing_cols:
                    if "farmer_price_per_kg" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN farmer_price_per_kg NUMERIC(10, 2);"))
                    if "supplier_margin_per_kg" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN supplier_margin_per_kg NUMERIC(10, 2) DEFAULT 15.00;"))
                    if "supplier_price_per_kg" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN supplier_price_per_kg NUMERIC(10, 2);"))
                    if "retail_price_per_kg" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retail_price_per_kg NUMERIC(10, 2);"))
                    if "retailer_markup_per_kg" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retailer_markup_per_kg NUMERIC(10, 2) DEFAULT 30.00;"))
                    if "retail_confirmed_by" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retail_confirmed_by VARCHAR(64);"))
                    if "retail_confirmed_at" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retail_confirmed_at TIMESTAMP;"))
                    if "retailer_received_at" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retailer_received_at TIMESTAMP;"))
                    if "retailer_received_by" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN retailer_received_by VARCHAR(64);"))
                    if "is_available" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT 1;"))
                    if "batch_number" not in existing_cols:
                        conn.execute(text("ALTER TABLE crops ADD COLUMN batch_number VARCHAR(32);"))
                    conn.execute(text("UPDATE crops SET batch_number = 'BATCH-2026-' || printf('%05d', crop_id) WHERE batch_number IS NULL OR batch_number = '';"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_crops_batch_number ON crops(batch_number);"))
                    conn.commit()
    except Exception as exc:
        logger.debug("Column presence verification notice: %s", exc)


def check_database_health() -> dict:
    if _db_url.startswith("sqlite"):
        return {
            "primary": "SQLite",
            "connected": True,
            "storage_mode": "persistent_local",
            "notice": "Operating on persistent local SQLite database",
        }
    try:
        with primary_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "primary": "PostgreSQL (Supabase)",
            "connected": True,
            "storage_mode": "persistent",
            "notice": "Connected to persistent cloud PostgreSQL",
        }
    except Exception as exc:
        return {
            "primary": "PostgreSQL (Supabase)",
            "connected": False,
            "storage_mode": "ephemeral_fallback",
            "notice": f"Cloud PostgreSQL is paused or unreachable ({type(exc).__name__}). Operating on temporary serverless fallback (/tmp). Data will not persist permanently across restarts until Supabase is unpaused.",
        }


def get_db() -> Generator[Session, None, None]:
    session = None
    use_fallback = False

    if not _db_url.startswith("sqlite"):
        try:
            session = PrimarySessionLocal()
            session.execute(text("SELECT 1"))
        except Exception as exc:
            logger.warning(
                "Primary database connection check failed (%s). Falling back to resilient local database.",
                exc,
            )
            if session:
                try:
                    session.close()
                except Exception:
                    pass
                session = None
            use_fallback = True

    if use_fallback or session is None:
        session = FallbackSessionLocal() if not _db_url.startswith("sqlite") else PrimarySessionLocal()

    try:
        yield session
    finally:
        session.close()
