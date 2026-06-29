# Preview Session Management — Phase 12–19

Phase 12 adds **local preview artifact management**. Phase 13 adds **local WAV export artifacts**. Phase 15 adds **MP3 reference exports**. Phase 16 adds **mastering preset prototypes**. Phase 17 adds **local project package export**. Phase 18 adds **mix controls**. Phase 19 adds **workflow QA hardening** (session checklist, dependency health, delete error surfacing).

## What This Phase Adds

- Preview artifact browser (stem, combined-preview, pitch-time-preview, **export**)
- Safe local cleanup (single artifact or clear all session artifacts)
- Combined preview duration controls (15 / 30 / 60 seconds, custom up to 60)
- FFmpeg/ffprobe technical readout and loudness analysis where practical
- Export panel (unlocks when combined preview or stem artifacts exist — Phase 13–14)
- MP3 reference export section (unlocks when WAV export exists — Phase 15)
- Mastering preset section (unlocks when WAV export exists — Phase 16)
- Project package section (unlocks when packageable artifacts exist — Phase 17)
- Session workflow checklist in sidebar (Phase 19 — informational, no auto-process)
- Delete/clear failures surfaced in artifact browser (Phase 19)
- Auto-refresh after stem/combined/export create and delete/clear (`src/lib/artifactRefresh.ts`)

## Preview Artifacts Are Local

All preview artifacts live under the sidecar workspace:

```text
.work/artifacts/stems/{id}/
.work/artifacts/combined-preview/{id}/preview.wav
.work/artifacts/pitch-time-preview/{id}.wav
.work/artifacts/exports/{id}/export.wav
.work/artifacts/exports/{id}/export.mp3
.work/artifacts/masters/{id}/master.wav
.work/artifacts/masters/{id}/master.meta.json
.work/artifacts/packages/{id}/MashLab_Project_{label}/
.work/artifacts/packages/{id}/mashlab-package.zip
.work/artifacts/packages/{id}/package.meta.json
```

Preview artifacts are **not** final exports (except export-type artifacts which are local user-generated WAV/MP3 files — still not published releases). Nothing is cloud-hosted or shared publicly.

The browser UI stores optional session metadata (source/target track labels) in **sessionStorage** only. Export preferences (mode, bitrate, loudness) use **localStorage** only — no raw audio. Raw upload paths are not shown in the artifact browser.

## Sidecar Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/artifacts` | List local preview and export artifacts |
| `GET /v1/artifacts/{id}/metadata` | ffprobe + loudness readout |
| `DELETE /v1/artifacts/{id}` | Delete one artifact safely |
| `DELETE /v1/artifacts?scope=session` | Clear all session artifacts under `.work/artifacts/` |
| `POST /v1/export/wav` | Create local WAV export from combined preview (Phase 13) |
| `POST /v1/export/mp3` | Create local MP3 reference from WAV export (Phase 15) |
| `GET /v1/artifacts/exports/{id}/export` | Playback/download export WAV |
| `GET /v1/artifacts/exports/{id}/export.mp3` | Playback/download export MP3 |
| `POST /v1/master/wav` | Run mastering preset on WAV export (Phase 16) |
| `GET /v1/artifacts/masters/{id}/master` | Playback/download master WAV |
| `POST /v1/export/package` | Bundle selected artifacts into local project folder/ZIP (Phase 17) |
| `GET /v1/artifacts/packages/{id}/download` | Download package ZIP when created |

Preview entries include `preview_only: true` and `final_export: false`.

Export entries include `preview_only: false`, `final_export: true`, and labels such as:

> Local export — user responsible for rights. No public distribution rights granted.

MP3 export entries use:

> Local MP3 reference export — user responsible for rights. No public distribution rights granted.

Package entries use:

> Local project package — user responsible for rights. No public distribution rights granted. Not public sharing.

Package entries include `package_only: true`, `public_share: false`, and `final_export: false`.

## Cleanup Behavior

- Deletes only known preview artifact paths under `.work/artifacts/`
- Rejects invalid/non-alphanumeric artifact IDs (path traversal prevention)
- Does **not** delete raw uploads outside `.work/`
- Does **not** delete unrelated files

## Loudness / Technical Readout

Metadata uses:

- **ffprobe** for duration, sample rate, channels, codec, container, file size
- **FFmpeg volumedetect** for peak level when available
- **FFmpeg loudnorm analysis pass** for integrated LUFS / true peak when available

If loudnorm cannot run or parse, the API returns structured status:

- `available` — LUFS and/or true peak measured
- `partial` — peak only or incomplete loudnorm output
- `not_available` — FFmpeg missing or analysis failed

**No fake loudness values are returned.**

## Combined Preview Duration Controls

The combined preview panel exposes 15s / 30s (default) / 60s presets and custom duration up to **60 seconds** (server-side max). Longer selections show an estimated processing-time warning.

## Export Panel Status (Phase 13–17)

WAV export unlocks when at least one combined-preview artifact exists **or** stem artifacts exist for full-length re-render. MP3 and mastering unlock when WAV exports exist. Project package export unlocks when packageable artifacts exist (stems, combined preview, exports, masters with audio). Club versions and public sharing remain unavailable.

See `docs/LOCAL_EXPORTS.md`, `docs/QA_WORKFLOW_CHECKLIST.md`, and `docs/EXPORT_AND_MASTERING_PLAN.md`.

## Cleanup Safety (Phase 19)

- Delete/clear only removes paths under `.work/artifacts/`
- Artifact ids must be alphanumeric — traversal ids rejected
- Clear session deletes stems, combined previews, exports, masters, and packages listed by the sidecar
- Raw uploads and browser session files are not deleted by artifact cleanup

## Privacy and Rights

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

No downloader, no streaming integrations, no public sharing hub.

## Related Docs

- `docs/PROJECT_PACKAGE_EXPORT.md`
- `docs/STEM_SEPARATION.md`
- `docs/EXPORT_AND_MASTERING_PLAN.md`
