"""MashLab local engine service configuration."""

from pathlib import Path

SERVICE_NAME = "mashlab-local-engine"
SERVICE_VERSION = "0.1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 47831

BASE_DIR = Path(__file__).resolve().parent
WORK_DIR = BASE_DIR / ".work"
TEMP_DIR = WORK_DIR / "temp"

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
]
