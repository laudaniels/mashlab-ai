#!/usr/bin/env bash
# Curl rhythm self-test + optional phrase validation on Linux/WSL.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${SIDECAR_URL:-http://127.0.0.1:47831}"
STRICT="${STRICT:-0}"

echo "MashLab rhythm self-test harness (Linux)"
echo "URL: $URL/v1/capabilities/rhythm-selftest"
echo "No user audio is processed by the self-test endpoint."

if ! curl -sf "$URL/health" >/dev/null 2>&1; then
  echo "Sidecar not reachable at $URL — start with: bash scripts/run-sidecar-linux.sh"
  if [ "$STRICT" = "1" ]; then
    exit 1
  fi
  exit 0
fi

curl -sf "$URL/v1/capabilities/rhythm-selftest" | python3 -m json.tool

echo ""
echo "=== Phrase validation (synthetic fixture) ==="
VENV="$ROOT/.venv-rhythm"
if [ -d "$VENV" ]; then
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  cd "$ROOT/local-engine/service"
  ARGS=""
  if [ "$STRICT" = "1" ]; then
    ARGS="--strict"
  fi
  python validate_rhythm_linux.py $ARGS
  exit $?
else
  echo "Skip phrase validation — .venv-rhythm not found (run setup-rhythm-linux.sh)"
  exit 0
fi
