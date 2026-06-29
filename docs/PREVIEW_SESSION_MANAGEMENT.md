# Preview Session Management — Phase 12

Phase 12 adds **local preview artifact management** without turning previews into final exports.

## What This Phase Adds

- Preview artifact browser (stem, combined-preview, pitch-time-preview)
- Safe local cleanup (single artifact or clear all session previews)
- Combined preview duration controls (15 / 30 / 60 seconds, custom up to 60)
- FFmpeg/ffprobe technical readout and loudness analysis where practical
- Locked export/mastering prep panel (architecture only)

## Preview Artifacts Are Local

All preview artifacts live under the sidecar workspace:

```text
.work/artifacts/stems/{id}/
.work/artifacts/combined-preview/{id}/preview.wav
.work/artifacts/pitch-time-preview/{id}.wav
```

They are **not** final exports, not cloud-hosted, and not shared publicly.

The browser UI stores optional session metadata (source/target track labels) in **sessionStorage** only. Raw upload paths are not shown in the artifact browser.

## Sidecar Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/artifacts` | List local preview artifacts |
| `GET /v1/artifacts/{id}/metadata` | ffprobe + loudness readout |
| `DELETE /v1/artifacts/{id}` | Delete one preview artifact safely |
| `DELETE /v1/artifacts?scope=session` | Clear all preview artifacts under `.work/artifacts/` |

All preview entries include:

- `preview_only: true`
- `final_export: false`

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

## Export Panel Status

Export/mastering remains **locked**. The prep panel documents future targets only:

- WAV export
- MP3 export
- Stems export package
- DJ-safe preview master
- Planned general playback loudness target around **-14 LUFS / -1 dBTP**
- Planned club version target (not implemented)

Copy must state: **Export is not implemented yet. Current previews are not final masters.**

## Privacy and Rights

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

No downloader, no streaming integrations, no public sharing hub.

## Related Docs

- `docs/COMBINED_PREVIEW.md`
- `docs/STEM_SEPARATION.md`
- `docs/EXPORT_AND_MASTERING_PLAN.md`
