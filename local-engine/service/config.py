"""MashLab local engine service configuration."""

from pathlib import Path

SERVICE_NAME = "mashlab-local-engine"
SERVICE_VERSION = "0.1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 47831

BASE_DIR = Path(__file__).resolve().parent
WORK_DIR = BASE_DIR / ".work"
TEMP_DIR = WORK_DIR / "temp"

# Local dev/preview origins. Vite increments the port (5173 -> 5174 -> 5175 ...)
# when the default is occupied, so allow a small localhost-only fallback range.
# These are all loopback origins — no remote hosts are permitted.
_DEV_PORT_RANGE = range(5173, 5184)
_PREVIEW_PORT_RANGE = range(4173, 4184)

ALLOWED_ORIGINS = [
    f"http://{host}:{port}"
    for host in ("127.0.0.1", "localhost")
    for port in (*_DEV_PORT_RANGE, *_PREVIEW_PORT_RANGE)
]
