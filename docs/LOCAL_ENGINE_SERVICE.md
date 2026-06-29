# Local Engine Service

MashLab AI / CyphaBlend AI is local-first. Heavy audio work runs in a user-controlled Python sidecar at `local-engine/service/`, not via silent cloud uploads.

## Current State (Phases 11–19)

Implemented sidecar lanes:

- Health + capabilities detection
- ffprobe metadata
- librosa BPM/key analysis (optional)
- Rubber Band pitch/time preview
- Demucs two-stem preview
- Combined vocal-over-instrumental preview (Rubber Band + FFmpeg)
- Local WAV export (preview copy + full-length re-render)
- MP3 reference export
- Mastering preset prototypes
- Mix quality controls (gain, fades, limiter/clipping guard prototypes)
- Project package export (folder/ZIP)
- Artifact list/metadata/delete/clear under `.work/artifacts`

The browser MVP still works without the sidecar (metadata-only mode).

## Environment Setup

### Python (required for sidecar)

Install **Python 3.12+** and add to PATH:

```text
C:\Users\<you>\AppData\Local\Programs\Python\Python312
C:\Users\<you>\AppData\Local\Programs\Python\Python312\Scripts
```

Verify: `python --version`

### FFmpeg / ffprobe (required for mix + export)

Install FFmpeg and add the `bin` directory to PATH.

Verify: `npm run check:local-engine`

### Rubber Band CLI (required for pitch/time + combined preview)

Install `rubberband-cli` and ensure `rubberband` (or `rubberband.exe`) is on PATH.

### Demucs + PyTorch (required for stem preview)

Inside the service virtualenv:

```powershell
pip install torch demucs
```

First run may download model weights.

### librosa (optional — BPM/key analysis)

```powershell
pip install -r requirements-analysis.txt
```

## Recommended Service Shape

```text
local-engine/
  check-binaries.mts          # FFmpeg PATH check
  service/
    main.py                   # FastAPI app
    capabilities.py           # Dependency detection
    artifact_management.py    # List/delete under .work/artifacts
    tests/
  artifacts/                  # gitignored workspace parent
```

Runtime artifact root: `.work/artifacts/` (stems, combined-preview, exports, masters, packages).

## HTTP Boundary

Default bind: `http://127.0.0.1:47831`

### Core endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Service online + rights notice |
| `GET /v1/capabilities` | Python, FFmpeg, Rubber Band, Demucs, librosa status |
| `POST /v1/analyze/beat` | BPM analysis |
| `POST /v1/analyze/key` | Key analysis |
| `POST /v1/analyze/phrases` | Phrase/downbeat analysis (heuristic + optional advanced) |
| `POST /v1/process/pitch-time-preview` | Rubber Band short preview |
| `POST /v1/process/stem-preview` | Demucs two-stem preview |
| `POST /v1/process/combined-preview` | Vocal-over-bed preview |
| `POST /v1/export/wav` | Preview-length WAV copy |
| `POST /v1/export/full-wav` | Full-length stem re-render |
| `POST /v1/export/mp3` | MP3 reference from WAV export |
| `POST /v1/master/wav` | Mastering preset prototype |
| `POST /v1/export/package` | Local project package |
| `GET /v1/artifacts` | List artifacts |
| `GET /v1/artifacts/{id}/metadata` | Technical + loudness readout |
| `DELETE /v1/artifacts/{id}` | Delete single artifact |
| `DELETE /v1/artifacts?scope=session` | Clear all session artifacts |

See `docs/COMBINED_PREVIEW.md`, `docs/LOCAL_EXPORTS.md`, `docs/MIX_CONTROLS.md`, `docs/MASTERING_PRESETS.md`, `docs/PROJECT_PACKAGE_EXPORT.md`, and `docs/QA_WORKFLOW_CHECKLIST.md`.

## Privacy + Rights

- User-supplied audio stays local
- No training use, no public sharing, no distribution rights granted
- Health endpoint includes the required rights doctrine string

## Quality Checks

```bash
npm run check:python-service
npm run check:python-service:test
npm run check:local-engine
```

If `check:local-engine` fails because FFmpeg/ffprobe are not on PATH, fix PATH for the session and rerun.
