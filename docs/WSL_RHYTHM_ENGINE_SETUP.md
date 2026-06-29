# WSL / Linux Rhythm Engine Setup (Phase 26)

Optional advanced rhythm engines (Essentia, madmom) are **not required** for MashLab AI. The Windows browser MVP and heuristic phrase planning work without them. Use this guide to validate verified downbeat/phrase analysis on Linux or WSL.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Known Windows Python 3.12 limitations

Phase 25 install attempts on **Windows Python 3.12** failed:

| Package | Result |
|---------|--------|
| Essentia | Source build failed — needs Unix `rm`/waf tooling |
| madmom | Build failed — needs Cython + native compile chain |

**Windows MVP is unaffected.** Heuristic phrase planning via librosa remains the default. Use WSL2 or native Linux for optional verified engines.

## Recommended environment

- **OS:** Ubuntu 22.04+ in WSL2, or native Linux/macOS
- **Python:** 3.10 or 3.11 (3.12 may work on Linux with pre-built wheels; test first)
- **FFmpeg:** required on PATH for sidecar metadata/decode lanes
- **Virtualenv:** recommended to isolate optional rhythm deps

## Setup steps (WSL2 Ubuntu example)

```bash
# 1. System packages
sudo apt update
sudo apt install -y python3-venv python3-pip ffmpeg \
  build-essential libfftw3-dev libavcodec-dev libavformat-dev \
  libavutil-dev libswresample-dev libyaml-dev

# 2. Project virtualenv
cd /path/to/mashlab-ai
python3 -m venv .venv-rhythm
source .venv-rhythm/bin/activate
pip install -U pip

# 3. Sidecar base deps (if not already installed)
pip install fastapi uvicorn librosa numpy scipy pydantic python-multipart

# 4. Optional rhythm engines (pick one or both)
pip install cython
pip install madmom          # verified downbeat/phrase via DBNDownBeatTracker
pip install essentia        # or: conda install -c conda-forge essentia

# 5. Start sidecar
cd local-engine/service
uvicorn main:app --host 127.0.0.1 --port 47831
```

## Rhythm self-test (no user audio)

After starting the sidecar:

```bash
curl -s http://127.0.0.1:47831/v1/capabilities/rhythm-selftest | python3 -m json.tool
```

Or click **Run rhythm self-test** in the MashLab UI (Phrase Analysis or Local Engine Status).

The self-test:

- Generates a synthetic 120 BPM click track in `.work/temp`
- Tests heuristic, Essentia, madmom, and BeatNet+ stub independently
- **Never processes user uploads**
- Deletes the temp WAV after the run
- Reports `pass` / `missing_dependency` / `failed` / `not_implemented` per engine

## Phrase analysis validation (generated clip)

Use a short synthetic WAV you generate locally — not copyrighted material:

```bash
# After self-test passes for madmom/Essentia, test phrase endpoint with the same synthetic file:
python3 - <<'PY'
from pathlib import Path
from rhythm_selftest import generate_click_track_wav, run_rhythm_selftest
from phrase_analysis import analyze_phrase_file

p = Path(".work/temp/manual-phrase-test.wav")
p.parent.mkdir(parents=True, exist_ok=True)
generate_click_track_wav(p)
r = analyze_phrase_file(p, "manual-test.wav", method="auto", phrase_length_bars=8)
print(r.model_dump())
p.unlink(missing_ok=True)
PY
```

## Fallback behavior

When advanced engines are missing or fail self-test:

- `method=auto` falls back to **heuristic_from_beats**
- Explicit advanced methods return `missing_dependency` with setup guidance
- Verified labels appear **only** when engines return real markers
- DJ review is always required

## Manual validation log template

Record results when validating on WSL/Linux:

| Field | Value |
|-------|-------|
| OS | e.g. Ubuntu 22.04 WSL2 |
| Python | e.g. 3.11.8 |
| Engine installed | e.g. madmom 0.16.1 |
| Self-test heuristic | pass / failed |
| Self-test madmom | pass / missing_dependency |
| Self-test Essentia | pass / missing_dependency |
| Phrase analysis auto | basis + method_used |

## Related docs

- `local-engine/service/requirements-rhythm.txt`
- `docs/PHRASE_DOWNBEAT_ANALYSIS.md`
- `docs/LOCAL_ENGINE_SERVICE.md`
