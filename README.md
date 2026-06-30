# MashLab AI / CyphaBlend AI

Two songs in. A DJ-ready mashup out.

This repository is the initial product foundation for a private, local-first AI-assisted DJ mashup application. The current app accepts two user-supplied audio files, inspects browser-available metadata locally, renders a lightweight waveform summary when decoding succeeds, and shows clearly labeled placeholders for the future analysis, stem, arrangement, and export engines.

## Stack

- Vite + React + TypeScript for a fast professional frontend shell.
- Browser Web Audio APIs for the safe local-only upload metadata prototype.
- Plain CSS for a focused pro-audio interface without locking the project into a design system too early.
- Future engine adapters are separated across `src/domain/enginePlan.ts`, `src/engines/`, and `src/lib/analysisPipeline.ts` so Demucs, BeatNet+, Essentia, Rubber Band, and export/mastering services can be added behind stable boundaries.

## Current Status

Implemented:

- Two local audio upload slots.
- Browser-local file validation and metadata inspection.
- WAV container sample-rate/channel parsing when available.
- Web Audio decoding for duration and waveform summaries when the browser supports the file.
- Honest adapter-hook placeholders for beat/key/stem analysis.
- Sequential track job queue with implemented browser metadata adapter.
- Local Python sidecar at `local-engine/service/` with health, capabilities, jobs, ffprobe metadata, and experimental librosa BPM/key endpoints.
- Local engine status indicator and beat/key lanes that call the sidecar when librosa is available.
- Beat grid model with heuristic 8-bar phrase planning (DJ review required).
- Harmonic compatibility planner with Camelot-style labels and pitch-shift suggestions (planning only).
- Mashup Planning panel when both tracks are analyzed.
- In-memory beat/key analysis cache to avoid duplicate uploads within a session.
- Session-scoped artifact store per track (browser memory only, no cloud).
- DJ override controls for BPM, key, mode, Camelot, alignment offset, and phrase length.
- Timeline alignment UI with waveform preview, beat markers, and heuristic phrase regions.
- Pitch/time planning panel with mash intent selector (planning only).
- Rubber Band CLI capability detection in local sidecar.
- **Rubber Band pitch/time preview processing** (user-initiated, short clips only).
- **Demucs vocal/instrumental stem preview** (user-initiated, two-stem mode, one track at a time).
- **Combined vocal-over-instrumental preview** (Rubber Band vocal + FFmpeg mix; requires stem previews first).
- **Preview artifact browser** with local cleanup and technical/loudness readout.
- **Local WAV export** from combined preview copy or **full-length re-render from stem artifacts + plan state**.
- **Local MP3 reference export** from existing WAV export artifacts (320/256/192 kbps).
- **Local mastering preset prototypes** (measurement-only, general safe reference, DJ loudness prototype, club loudness prototype).
- **Mix quality controls** before combined preview and full-length export (gain, fades, limiter/clipping guard prototypes).
- **Local project package export** — bundle selected artifacts into folder or ZIP (not public sharing).
- **Export session UX** — local preferences for mode, bitrate, loudness, and explicit re-export.
- **Locked future targets** for club version certification and public sharing (not implemented).
- **End-to-end workflow QA** — session checklist panel, dependency health display, actionable errors, artifact lifecycle safety (Phase 19).
- **Arrangement draft intelligence prototype** — Clean Blend / Club Edit / Creative Blend planning templates with optional apply-settings handoff (Phase 20; planning only, no auto-processing).
- **Arrangement section preview binding** — select advisory sections, bind preview duration/start/mix, deep-link missing requirements (Phase 21).
- **Arrangement traceability + stale binding** — section context through preview/export/package metadata; stale warnings with re-apply (Phase 22).
- **Section window export + context diff guard** — advisory planning-window WAV from stems; bound vs current diff before export (Phase 23).
- **Phrase/downbeat analysis upgrade path** — optional `/v1/analyze/phrases`, heuristic fallback, rhythm engine adapters (Phase 24–25).
- **Rhythm engine self-test** — `GET /v1/capabilities/rhythm-selftest`, WSL/Linux setup docs (Phase 26).
- **WSL rhythm sidecar dev profile** — optional `npm run sidecar:wsl:*` scripts, Linux validation harness (Phase 27).
- **Windows runtime setup + MVP UX polish** — `setup:windows:*`, `start:local`, first-run guidance, dependency tier labels (Phase 28).
- **Windows FFmpeg + Rubber Band PATH validation** — official BtbN FFmpeg and Breakfast Quay Rubber Band CLI; pitch/time preview validated with synthetic audio (Phase 29–30).
- **Demucs / PyTorch stem preview validation** — CPU torch 2.5.1 + Demucs 4.x in sidecar venv; two-stem preview validated with synthetic lavfi audio (Phase 31).
- **Full end-to-end local QA** — stem → combined → WAV → MP3 → master → package validated with synthetic audio; evidence in `qa/full-local-workflow/phase-32/` (Phase 32).
- **Production hardening** — venv-aware Python checks, `sidecar:start|stop|status`, optional `setup:analysis`, strict setup accepts venv Python (Phase 33).
- **Release documentation pass** — `start:local:windows`, librosa validation, manual UI screenshot checklist (Phase 34).
- **Release packaging** — pinned dependency manifest, MVP checklist, demo ZIP recipe, CI `mvp-checks`, Playwright screenshot script (Phase 35).
- SessionStorage persistence for DJ overrides, mash intent, stem preview artifact refs, and preview registry metadata (no raw audio).
- Browser-only fallback when the sidecar or optional analysis dependencies are unavailable.

Not implemented yet:

- Verified downbeat/phrase when optional madmom is installed (Linux/WSL); Essentia beat extraction when available; Windows may require WSL/conda.
- Automated arrangement rendering from draft plans (Phase 20–21 is planning-only; section binding configures preview — user still clicks Create preview).
- Club version certification and public sharing.

## Legal Notice

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

The app does not provide music, does not include a downloader, does not connect to streaming services, and does not include a public sharing hub in the MVP.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

### Windows setup (optional processing)

```powershell
npm run setup:windows:check    # detect Python, FFmpeg, Rubber Band, etc.
npm run setup:windows:guide    # print setup guide
npm run start:local            # step-by-step start checklist
npm run check:local-engine     # FFmpeg/ffprobe PATH only
```

See **`docs/WINDOWS_RUNTIME_SETUP.md`** for PATH requirements and interpreting check failures. Browser MVP upload works without FFmpeg or Python.

### Run local demo on Windows

One-command start (preflight + sidecar + Vite in new window):

```powershell
npm install
npm run setup:windows:check:strict   # venv python + FFmpeg/ffprobe
npm run start:local:windows            # sidecar + dev server
```

Open **http://127.0.0.1:5173/** — upload tracks you own or are authorized to use. Each processing step is **user-initiated only**.

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:5173/ | Vite app |
| http://127.0.0.1:47831/health | Sidecar health |
| http://127.0.0.1:47831/v1/capabilities | Engine status |

```powershell
npm run sidecar:status                 # verify sidecar
npm run setup:analysis                 # optional librosa BPM/key
npm run sidecar:wsl:check              # optional WSL rhythm (not required)
```

**Limitations:** No public sharing, cloud upload, downloader, or streaming. librosa analysis is experimental. See **`docs/PHASE_34_RELEASE_DOCUMENTATION.md`**.

### Release candidate packaging (Phase 35)

```powershell
npm run collect:release-versions       # pinned dependency snapshot
npm run capture:release-screenshots    # UI PNGs (Playwright + local Vite/sidecar)
npm run package:demo-release           # optional small demo ZIP
```

Checklist: **`docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md`** · Dependencies: **`docs/RELEASE_DEPENDENCIES_WINDOWS.md`** · CI: **`docs/CI_CHECKS.md`**

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Local Helper Service (Optional)

The browser MVP works without this service. To run the localhost analysis sidecar:

```powershell
cd local-engine\service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-analysis.txt
python -m uvicorn main:app --host 127.0.0.1 --port 47831
```

See `local-engine/service/README.md`, **`docs/WINDOWS_RUNTIME_SETUP.md`**, `docs/QA_WORKFLOW_CHECKLIST.md`, `docs/ARRANGEMENT_DRAFTS.md`, `docs/SECTION_EXPORTS.md`, `docs/PHRASE_DOWNBEAT_ANALYSIS.md`, `docs/BPM_KEY_ANALYSIS.md`, `docs/BEAT_GRID_AND_HARMONIC_PLANNING.md`, `docs/PITCH_TIME_PLANNING.md`, `docs/RUBBER_BAND_PROCESSING.md`, `docs/STEM_SEPARATION.md`, `docs/COMBINED_PREVIEW.md`, `docs/MIX_CONTROLS.md`, `docs/PREVIEW_SESSION_MANAGEMENT.md`, `docs/LOCAL_EXPORTS.md`, `docs/MASTERING_PRESETS.md`, `docs/PROJECT_PACKAGE_EXPORT.md`, `docs/LOCAL_ENGINE_SERVICE.md`, `docs/EXPORT_AND_MASTERING_PLAN.md`, `docs/SESSION_ARTIFACTS.md`, and `docs/TIMELINE_ALIGNMENT.md` for setup, PATH requirements, workflow QA, arrangement drafts, preview processing, mix controls, local exports, mastering presets, project packages, session artifacts, and timeline alignment.

## Quality Commands

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run check:local-engine
npm run setup:windows:check
npm run setup:windows:guide
npm run start:local
npm run check:python-service
npm run check:python-service:test
```

### Optional WSL/Linux rhythm profile (not required for Windows MVP)

```powershell
npm run sidecar:wsl:check      # detect WSL, print guidance
npm run sidecar:wsl:setup      # bootstrap .venv-rhythm in WSL (when installed)
npm run sidecar:wsl            # start sidecar in WSL
npm run sidecar:wsl:selftest   # rhythm self-test harness (non-strict)
```

See `docs/WSL_RHYTHM_ENGINE_SETUP.md`.

**Environment note:** Python and FFmpeg may not be on the default Windows PATH. See **`docs/WINDOWS_RUNTIME_SETUP.md`**, `docs/QA_WORKFLOW_CHECKLIST.md`, and `docs/LOCAL_ENGINE_SERVICE.md`. If `check:local-engine` or `setup:windows:check` reports FFmpeg/ffprobe missing, install FFmpeg, add its bin folder to PATH, and rerun — the browser MVP still works without FFmpeg.
