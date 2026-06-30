#!/usr/bin/env bash
# Run MashLab sidecar using .venv-rhythm on Linux/WSL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-rhythm"
SERVICE="$ROOT/local-engine/service"
HOST="${SIDECAR_HOST:-127.0.0.1}"
PORT="${SIDECAR_PORT:-47831}"

if [ ! -d "$VENV" ]; then
  echo "Missing $VENV — run: bash scripts/setup-rhythm-linux.sh"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
cd "$SERVICE"
echo "Starting MashLab sidecar at http://${HOST}:${PORT} (Ctrl+C to stop)"
exec python -m uvicorn main:app --host "$HOST" --port "$PORT"
