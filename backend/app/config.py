from functools import lru_cache
import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_JWT_SECRETS = {
    "agritrace_jwt_secret_key_2026_super_secure",
    "secret",
    "changeme",
    "jwt_secret",
    "password",
    "local_dev_only_jwt_secret_key_32chars_minimum",
}


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/farm_traceability"
    migration_database_url: str = ""
    api_cors_origins: str = "https://frontend-tau-three-20.vercel.app,http://localhost:5173,http://127.0.0.1:5173"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # Remote Ganache EVM Configuration
    ganache_rpc_url: str = "http://127.0.0.1:7545"
    ganache_rpc_token: str = ""
    ganache_chain_id: int = 1337
    ganache_contract_address: str = "0xb524d5e1329F405f004720C5FcD4F023916c64F3"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_production_jwt_secret(self) -> "Settings":
        env_val = (
            os.getenv("VERCEL_ENV")
            or os.getenv("ENVIRONMENT")
            or os.getenv("ENV")
            or ""
        ).strip().lower()
        is_production = env_val in ("production", "prod")

        # Resolve effective JWT secret
        secret = self.jwt_secret.strip() if self.jwt_secret else ""

        if is_production:
            if not secret:
                raise RuntimeError(
                    "Critical Security Error: JWT_SECRET environment variable is missing in production. "
                    "A unique, strong signing secret (minimum 32 characters) must be configured."
                )
            if secret.lower() in INSECURE_DEFAULT_JWT_SECRETS or len(secret) < 32:
                raise RuntimeError(
                    "Critical Security Error: Production JWT_SECRET is too short or set to an insecure default. "
                    "A unique, cryptographically strong secret of at least 32 characters is required."
                )
        else:
            # Safe fallback strictly for local development and offline unit tests
            if not secret:
                self.jwt_secret = "local_dev_only_jwt_secret_key_32chars_minimum"

        return self

    @property
    def cors_origins(self) -> list[str]:
        raw_origins = [origin.strip().rstrip("/") for origin in self.api_cors_origins.split(",") if origin.strip()]
        if "https://frontend-tau-three-20.vercel.app" not in raw_origins:
            raw_origins.insert(0, "https://frontend-tau-three-20.vercel.app")
        return list(dict.fromkeys(raw_origins))

    @property
    def normalized_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
