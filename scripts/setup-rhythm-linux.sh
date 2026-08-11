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
pip install -U pip wheel
# madmom (last released 2018) still imports pkg_resources at module load time;
# setuptools>=81 removed it. Pin below that so madmom stays importable.
pip install "setuptools<81"

echo ""
echo "=== Base sidecar dependencies ==="
pip install -r "$SERVICE/requirements.txt"
pip install -r "$SERVICE/requirements-analysis.txt"

MADMOM_STATUS="skipped"
ESSENTIA_STATUS="skipped"
STEMS_STATUS="skipped"

echo ""
echo "=== Optional: madmom (verified downbeat/phrase) ==="
set +e
pip install -r "$SERVICE/requirements-rhythm-linux.txt"
MADMOM_EXIT=$?
set -e
if [ "$MADMOM_EXIT" -eq 0 ]; then
  # madmom (last released 2018) predates three things this stack now has:
  # Python 3.10 moving collections.abc's ABCs out of collections, numpy 1.24
  # removing the np.float/np.int/etc. builtin aliases, and numpy tightening
  # np.asarray to reject ragged/inhomogeneous sequences. Patch all three
  # in place so import and DBNDownBeatTrackingProcessor actually work here.
  # Idempotent — a no-op on files where the pattern is already gone (e.g.
  # re-running this script).
  MADMOM_SITE_PACKAGES="$(python -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
  MADMOM_PKG_DIR="$MADMOM_SITE_PACKAGES/madmom"
  MADMOM_PROCESSORS="$MADMOM_PKG_DIR/processors.py"
  MADMOM_DOWNBEATS="$MADMOM_PKG_DIR/features/downbeats.py"

  if [ -d "$MADMOM_PKG_DIR" ]; then
    python - "$MADMOM_PKG_DIR" <<'PYEOF'
import re
import sys
import pathlib

root = pathlib.Path(sys.argv[1])
pattern = re.compile(r"\bnp\.(float|int|bool|object|str|complex)\b")
for path in root.rglob("*.py"):
    text = path.read_text()
    new_text, count = pattern.subn(r"\1", text)
    if count:
        path.write_text(new_text)
PYEOF
  fi
  if [ -f "$MADMOM_PROCESSORS" ]; then
    sed -i 's/^from collections import MutableSequence$/from collections.abc import MutableSequence/' "$MADMOM_PROCESSORS"
  fi
  if [ -f "$MADMOM_DOWNBEATS" ]; then
    sed -i 's/best = np\.argmax(np\.asarray(results)\[:, 1\])/best = np.argmax([r[1] for r in results])/' "$MADMOM_DOWNBEATS"
  fi

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
echo "=== Optional: Demucs / PyTorch (stem preview) ==="
# Installed into this same venv (not just the default local-engine/service/.venv)
# so a sidecar started with run-sidecar-linux.sh / npm run sidecar:wsl has both
# verified rhythm engines and stem preview available together.
set +e
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
  && pip install -r "$SERVICE/requirements-stems.txt"
STEMS_EXIT=$?
set -e
if [ "$STEMS_EXIT" -eq 0 ]; then
  if python -c "import torch, demucs" 2>/dev/null; then
    STEMS_STATUS="installed"
    echo "demucs/torch: SUCCESS"
  else
    STEMS_STATUS="import_failed"
    echo "demucs/torch: pip ok but import failed"
  fi
else
  STEMS_STATUS="install_failed"
  echo "demucs/torch: FAILED (optional — stem preview stays blocked)"
fi

echo ""
echo "=== Bootstrap summary ==="
echo "  venv: $VENV"
echo "  madmom: $MADMOM_STATUS"
echo "  essentia: $ESSENTIA_STATUS"
echo "  demucs/torch: $STEMS_STATUS"
echo ""
echo "Start sidecar: npm run sidecar:wsl  OR  bash scripts/run-sidecar-linux.sh"
echo "Self-test:     npm run sidecar:wsl:selftest"
exit 0
