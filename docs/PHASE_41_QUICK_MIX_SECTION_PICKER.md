# Phase 41 — Quick Mix section picker

**Product:** MashLab AI / CyphaBlend AI  
**Baseline tag:** `mashlab-quick-mix-listening-rc3` (`2e7773c`)  
**Scope:** Choose which 180 seconds to process — default behavior unchanged.

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

**Local-only. No cloud upload. No downloader. No streaming imports. No public sharing.**

---

## Why the 180-second cap remains

CPU Demucs stem separation is reliable on ~3-minute windows. Phase 41 does **not** increase the cap — it lets users pick **which** 180 seconds (hook, chorus, drop, custom intro) instead of always the first 3:00.

Trimming happens **before** Demucs (FFmpeg prep endpoint and/or stem `preview_start_seconds`) so the sidecar never runs separation on full-length songs.

## User flow (unchanged simplicity)

1. Vocal source  
2. Instrumental source  
3. **Section to use** (optional — defaults to First 3:00)  
4. **Mix**  
5. Local WAV + optional MP3  

Not Advanced Studio — no arrangement planner, section export, or multi-track timeline.

## Section picker UI

Under each upload card after a file is selected:

**Section to use**
- **First 3:00** (default — matches RC3)
- **Custom start** → minutes / seconds  
  - Helper: *MashLab will process 3:00 from this point.*

Optional: **Use the same start time for both sources** — when enabled, instrumental follows vocal start.

No auto-processing on drop. Prep/trim runs at **Mix** time with the selected offset.

## Default behavior (RC3 preserved)

If the user changes nothing:

| Setting | Value |
|---------|-------|
| Section | First 3:00 (offset 0) |
| Window | 180 s |
| Vocal gain | +1.5 dB |
| Bed gain | −3.0 dB |
| Master | −1.0 dB |
| Limiter + clip guard | on |
| Bed duck | on |

## Custom start examples

| Source | Start | Processed window |
|--------|-------|------------------|
| Vocal (Track A) | 1:05 | 1:05–4:05 |
| Instrumental (Track B) | 0:42 | 0:42–3:42 |
| Length cap | — | 3:00 MVP |

Output panel shows:

- Vocal section: 1:05–4:05  
- Instrumental section: 0:42–3:42  
- Length: 3:00 MVP cap  

Technical artifact IDs stay collapsed.

## Sidecar / API

| Field | Role |
|-------|------|
| `start_offset_seconds` | Quick Mix source prep (`POST /v1/process/quick-mix-source-prep`) |
| `preview_start_seconds` | Stem preview when raw file sent without prep |
| `max_preview_seconds` / `max_seconds` | 180 MVP cap |
| Source role | vocal → Track A / vocals stem; instrumental → Track B / no_vocals stem |

Validation errors (structured):

- *Start time is past the end of this file.*  
- *This file is shorter than the selected section.*  
- *Could not read duration. Try First 3:00.*

Failures do **not** show Done.

## Tests added/updated

**Node (`npm test`):** default 180 s, custom offsets, payload fields, output lines, no false Done, cap disclosure, local-only copy.

**Python (`npm run check:python-service:test`):** FFmpeg offset trim command, prep validation, stem preview offset rejection before Demucs.

## QA checklist

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-engine
npm run setup:windows:check
npm run setup:windows:check:strict
npm run check:python-service
npm run check:python-service:test
npm run smoke:quick-mix
npm run smoke:quick-mix:browser
```

Real-file browser QA (operator machine, filenames redacted):

| Case | Result |
|------|--------|
| Default First 3:00 | PASS |
| Custom vocal section | PASS (Track A @ 1:05) |
| Custom instrumental section | PASS (Track B @ 0:42) |
| Different starts per source | PASS |
| WAV export | PASS |
| MP3 export or non-blocking skip | PASS |
| No false Done on failure | PASS (unit + browser; no error-panel false Done) |
| Sidecar healthy after run | PASS |

**Operator notes (2026-07-01):** `D:\PATRICK FOLDER` top level has subfolders only (no audio files at root). Real-file browser QA used **Track A** / **Track B** MP3s from a child folder via `MASHLAB_QM_VOCAL` / `MASHLAB_QM_BEAT` (filenames not recorded in repo). Vocal section output **1:05�3:25** (partial window on ~205 s source); instrumental **0:42�3:42**.

**Artifact IDs (smoke):** WAV `537fb7327d16464dbe9dd86049212270`, MP3 `2834120bdb4746bfb27271138296979e`, stems `6e1168b342134a8ba5cd35a0403a51db` / `138115e2b5c649f1b524c88cc9c06276`.

**Artifact ID (real-file section browser QA):** WAV export `c095084d7e4c4d749228b8e18d047089` (~120 s run).

Tracks referenced as **Track A** (vocal) / **Track B** (instrumental) only — no commercial filenames in repo.

## Remaining limitations

- Still **180 seconds per source**, not full songs  
- Section selection is time-based, not beat/bar or lyric-aware  
- Unknown duration + custom start blocked client-side until metadata available  
- CPU Demucs remains slow; long-running step heartbeats unchanged  
- MP3 remains optional reference export  

## Related docs

- [QUICK_MIX_MODE.md](./QUICK_MIX_MODE.md)  
- [MVP_RELEASE_CANDIDATE_CHECKLIST.md](./MVP_RELEASE_CANDIDATE_CHECKLIST.md)  
- [PHASE_40_TRUE_PEAK_SAFETY.md](./PHASE_40_TRUE_PEAK_SAFETY.md)
