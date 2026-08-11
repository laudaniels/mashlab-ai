#!/usr/bin/env bash
# Optional Linux/WSL rhythm sidecar bootstrap — does not fail repo if optional engines fail.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-rhythm"
SERVICE="$ROOT/local-engine/service"

echo "MashLab rhythm bootstrap (Linux/WSL)"
echo "Root: $ROOT"
echo "Windows MVP is unchanged — this profile is optional."

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install python3-venv and retry."
  exit 1
fi

if ! python3 -m venv "$VENV"; then
  echo "ERROR: could not create $VENV"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -U pip wheel setuptools

echo ""
echo "=== Base sidecar dependencies ==="
pip install -r "$SERVICE/requirements.txt"
pip install -r "$SERVICE/requirements-analysis.txt"

MADMOM_STATUS="skipped"
ESSENTIA_STATUS="skipped"

echo ""
echo "=== Optional: madmom (verified downbeat/phrase) ==="
set +e
pip install -r "$SERVICE/requirements-rhythm-linux.txt"
MADMOM_EXIT=$?
set -e
if [ "$MADMOM_EXIT" -eq 0 ]; then
  if python -c "import madmom" 2>/dev/null; then
    MADMOM_STATUS="installed"
    echo "madmom: SUCCESS"
  else
    MADMOM_STATUS="import_failed"
    echo "madmom: pip ok but import failed"
  fi
else
  MADMOM_STATUS="install_failed"
  echo "madmom: FAILED (optional — heuristic fallback remains)"
fi

echo ""
echo "=== Optional: Essentia (beat extraction) ==="
set +e
pip install essentia
ESSENTIA_EXIT=$?
set -e
if [ "$ESSENTIA_EXIT" -eq 0 ]; then
  if python -c "import essentia" 2>/dev/null; then
    ESSENTIA_STATUS="installed"
    echo "essentia: SUCCESS"
  else
    ESSENTIA_STATUS="import_failed"
    echo "essentia: pip ok but import failed"
  fi
else
  ESSENTIA_STATUS="install_failed"
  echo "essentia: FAILED (optional)"
fi

echo ""
echo "=== Bootstrap summary ==="
echo "  venv: $VENV"
echo "  madmom: $MADMOM_STATUS"
echo "  essentia: $ESSENTIA_STATUS"
echo ""
echo "Start sidecar: npm run sidecar:wsl  OR  bash scripts/run-sidecar-linux.sh"
echo "Self-test:     npm run sidecar:wsl:selftest"
exit 0
