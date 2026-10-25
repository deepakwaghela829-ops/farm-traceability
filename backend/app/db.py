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
if _is_transaction_pooler:
    _engine_kwargs["poolclass"] = NullPool
    _engine_kwargs["connect_args"] = {"prepare_threshold": None, "sslmode": "require"}
elif _db_url.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

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
