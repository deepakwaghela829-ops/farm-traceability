from pathlib import Path
import sys

# Keep the existing backend package intact while exposing FastAPI through Vercel's
# Python runtime. Vercel imports this module as the /api function entrypoint.
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
