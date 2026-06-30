# Windows MVP release dependencies (pinned snapshot)

**Updated:** Phase 35 release packaging  
**Platform:** Windows 11 Home build 26200 (reference machine)

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

MashLab is a **local-only** private audio-processing tool. No public sharing, cloud upload, downloader, or streaming integrations.

## Pinned versions (reference snapshot)

Collect a fresh snapshot on your machine:

```powershell
npm run collect:release-versions
```

Output: `qa/full-local-workflow/phase-35/logs/release-versions.json`

| Component | Pinned / validated version | Verify |
|-----------|---------------------------|--------|
| Node.js | **v24.16.0** | `node -v` |
| npm | **11.13.0** | `npm -v` |
| Python (sidecar venv) | **3.12.10** | `local-engine/service/.venv/Scripts/python.exe --version` |
| Sidecar venv path | `local-engine/service/.venv/` | `npm run sidecar:status` |
| FFmpeg | **N-125365-g9a01c1cb6a-20260630** | `ffmpeg -version` |
| ffprobe | same build as FFmpeg | `ffprobe -version` |
| Rubber Band | **4.0.0** | `rubberband --version` |
| PyTorch (CPU) | **2.5.1+cpu** | venv: `python -c "import torch; print(torch.__version__)"` |
| Demucs | **4.0.1** | venv: `python -c "import demucs; print(demucs.__version__)"` |
| librosa (optional) | **0.11.0** | `npm run validate:analysis-lane` |
| numpy | **2.4.6** | venv import |
| soundfile | **0.14.0** | venv import |
| FastAPI stack | see `local-engine/service/requirements.txt` | `npm run check:python-service` |

### Example PATH locations (not committed)

These vary by machine — record yours in the snapshot log:

- FFmpeg: `C:\Users\<you>\tools\ffmpeg\...\ffmpeg.exe`
- Rubber Band: `C:\Users\<you>\tools\rubberband\...\rubberband.exe`

## Python requirements files

| File | Purpose |
|------|---------|
| `local-engine/service/requirements.txt` | Base sidecar (FastAPI, uvicorn) |
| `local-engine/service/requirements-analysis.txt` | Optional librosa BPM/key |
| `local-engine/service/requirements-stems.txt` | Optional Demucs stems |
| `local-engine/service/requirements-rhythm-linux.txt` | Optional WSL/Linux rhythm engines |

See also: `local-engine/service/requirements-lock-notes.md`

## Install order (Windows MVP)

```powershell
cd local-engine/service
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip install -r requirements-stems.txt
npm run setup:analysis
cd ../..
npm run sidecar:start
npm run setup:windows:check:strict
```

## Optional WSL rhythm lane

Not required for Windows MVP. Heuristic phrase planning remains the default.

```powershell
npm run sidecar:wsl:check
```

Manual workflow: `.github/workflows/rhythm-linux-validation.yml` (`workflow_dispatch`, `continue-on-error: true`).

## What is not committed

- Sidecar venv (`.venv/`)
- Sidecar work dir (`.work/`) — local artifacts
- Demucs/PyTorch hub model weights (user cache, typically `%USERPROFILE%\.cache\torch\hub`)
- FFmpeg/Rubber Band binaries (user PATH install)
- `node_modules/`, `dist/`

## Full verification suite

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-engine
npm run setup:windows:check:strict
npm run check:python-service:test:venv
npm run sidecar:status
npm run validate:analysis-lane
```
