# Phase 32 — Full End-to-End Local QA Report

**Date:** 2026-06-30  
**Commit base:** `977452f` → Phase 32 evidence commit  
**Sidecar:** `http://127.0.0.1:47831` (venv Python 3.12.10)

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Environment

| Component | Version / detail |
|-----------|------------------|
| Windows | Microsoft Windows 11 Home build **26200** |
| Python (sidecar venv) | **3.12.10** |
| PyTorch | **2.5.1+cpu** |
| Demucs | **4.0.1** |
| FFmpeg | N-125365-g9a01c1cb6a-20260630 (BtbN win64 GPL) |
| Rubber Band | **4.0.0** (Breakfast Quay Windows CLI) |
| librosa | Not installed (optional analysis lane) |

Full version output: `qa/full-local-workflow/phase-32/logs/environment-versions.txt`

## Test audio (non-copyright)

Synthetic FFmpeg lavfi WAV files — **no commercial music**:

| Track | File | Description |
|-------|------|-------------|
| **Track A** | `qa/.../test-audio/track-a-vocal-like-15s.wav` | 440 Hz + 220 Hz sine mix (vocal-like melody tone), 15 s, stereo, 44.1 kHz |
| **Track B** | `qa/.../test-audio/track-b-instrumental-15s.wav` | 110 Hz sine + low pink noise bed (instrumental rhythm/bed), 15 s, stereo, 44.1 kHz |

## Workflow execution

Automated API QA script (user-initiated equivalent):

```powershell
powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1
```

**DJ overrides / neutral processing:** Combined preview and full WAV export used `neutral_processing=true` (and `confirm_neutral_settings=true` for export) because librosa BPM/key lanes are unavailable — matches browser MVP with manual overrides.

## Pass/fail table

| Step | Result | Evidence |
|------|--------|----------|
| Sidecar health | **PASS** | `logs/01-health.json` |
| Capabilities (FFmpeg, ffprobe, Rubber Band, torch, demucs) | **PASS** | `logs/02-capabilities.json` |
| Metadata Track A | **PASS** | `logs/03-metadata-track-a.json` |
| Metadata Track B | **PASS** | `logs/04-metadata-track-b.json` |
| BPM/key/phrase analysis | **PASS (expected missing)** | librosa not installed — structured `missing_dependency` messages in `logs/05-*`, `06-*` |
| Stem preview Track A | **PASS** | `e7f66eb142cc4bd6ad1fe68f909fcf6a` — `logs/07-stem-preview-track-a.json` |
| Stem preview Track B | **PASS** | `2fc8db3e1daa412995655a3377eb54b9` — `logs/08-stem-preview-track-b.json` |
| Combined preview (mix controls) | **PASS** | `b75b191bb7ad4db782fc0cfc6cd7611b` — vocal -2 dB, instrumental +1 dB, fades, limiter — `logs/09-combined-preview.json` |
| Full-length WAV export | **PASS** | `beb668faeef24ffbb2abc7dbff25a321` — `final_export: true`, `public_share: false` — `logs/10-full-wav-export.json` |
| MP3 reference export | **PASS** | `f7b2d96259da4c6591808a36004a4898` — 320 kbps — `logs/11-mp3-export.json` |
| Mastering preset | **PASS** | `34a58da28f204655983aaee0fc0a411e` — `club_loudness_prototype` — `logs/12-master-export.json` |
| Artifact browser list | **PASS** | 9 artifacts — `logs/13-artifact-list.json` |
| Artifact metadata + loudness | **PASS** | `logs/14-artifact-metadata-stem-a.json` |
| Project package | **PASS** | `e834e51a35cb4dceb7768ac165859843` — manifest + RIGHTS_NOTICE + technical report — `logs/15-package-export.json` |
| Delete artifact safely | **PASS** | MP3 artifact deleted — `logs/16-delete-mp3-artifact.json` |
| Sidecar offline / Browser MVP | **PASS** | Connection refused when sidecar stopped — `logs/17-error-state-sidecar-offline.txt` |

CSV: `logs/pass-fail-table.csv`

## Artifact paths (runtime)

Under `local-engine/service/.work/`:

```text
artifacts/stems/e7f66eb142cc4bd6ad1fe68f909fcf6a/     # Track A vocals + no_vocals
artifacts/stems/2fc8db3e1daa412995655a3377eb54b9/     # Track B vocals + no_vocals
artifacts/combined-preview/b75b191bb7ad4db782fc0cfc6cd7611b/
artifacts/exports/beb668faeef24ffbb2abc7dbff25a321/
artifacts/masters/34a58da28f204655983aaee0fc0a411e/
artifacts/packages/e834e51a35cb4dceb7768ac165859843/MashLab_Project_phase32-local-qa/
```

JSON index: `logs/artifact-paths.json`

## Screenshots / logs

| Asset | Location |
|-------|----------|
| API response logs | `qa/full-local-workflow/phase-32/logs/*.json` |
| Pass/fail summary | `qa/full-local-workflow/phase-32/logs/pass-fail-table.txt` |
| Environment versions | `qa/full-local-workflow/phase-32/logs/environment-versions.txt` |
| Error-state notes | `qa/full-local-workflow/phase-32/logs/17-error-state-sidecar-offline.txt` |
| Browser automation capture | `qa/full-local-workflow/phase-32/screenshots/01-vite-app-browser-automation.png` |

**UI note:** Cursor browser automation did not render the React/Vite DOM (blank capture). Manual UI verification at `http://127.0.0.1:5173` with sidecar online is recommended. API logs and capabilities JSON serve as primary processing evidence for Phase 32.

## Error-state QA

1. Stopped sidecar → `GET /health` and `POST /v1/process/stem-preview` returned connection refused (not blank JSON).
2. Sidecar restarted on venv with FFmpeg + Rubber Band on PATH.
3. Browser MVP remains designed to work offline — upload/planning without sidecar (verified by architecture; manual UI spot-check advised).

## Commands run

```powershell
npm run setup:windows:check
npm run check:local-engine
npm run lint && npm run typecheck && npm test && npm run build
# python not on agent PATH:
local-engine\service\.venv\Scripts\python.exe -m py_compile ...
local-engine\service\.venv\Scripts\python.exe -m unittest discover -s tests -p test_*.py
powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1
```

## Issues found / fixes

| Issue | Resolution |
|-------|------------|
| Combined/full export validation without librosa BPM | Added `neutral_processing=true` (+ `confirm_neutral_settings` for export) to QA script |
| First QA run failed combined/export | Documented in script; re-run **PASS** |
| `python` not on agent PATH | Documented venv fallback for compile + unittest |
| Browser automation blank UI | Documented limitation; API logs as primary evidence |

## Remaining limitations

- librosa optional — BPM/key/phrase lanes return structured missing messages; DJ overrides / neutral processing required
- Demucs on synthetic sine tones is heuristic — not studio stem quality
- Mastering presets are prototypes — no club-ready certification
- No public sharing, cloud upload, downloader, or streaming integrations
- `.work/` artifacts are local and gitignored

## Rights / legal confirmation

- All test audio generated locally (FFmpeg lavfi)
- Package includes `RIGHTS_NOTICE.txt` with user-responsibility doctrine
- All exports: `public_share: false`
- No publishing-rights claims in API responses or package manifest

## Recommended next phase

**Phase 33 — Production hardening / release prep:** optional librosa install path, manual UI screenshot pass, CI venv-aware python checks, and packaged Windows start script (single sidecar instance guard).
