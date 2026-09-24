from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

# Supabase transaction-pooler connections (port 6543) are designed for serverless
# functions. Use one connection per unit of work and disable psycopg prepared
# statements, which are not supported by transaction mode.
_is_transaction_pooler = ":6543/" in settings.database_url
_engine_kwargs = {"pool_pre_ping": True}
if _is_transaction_pooler:
    _engine_kwargs["poolclass"] = NullPool
    _engine_kwargs["connect_args"] = {"prepare_threshold": None, "sslmode": "require"}

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
