# Section Window Export (Phase 23)

Phase 23 adds a **user-initiated section-trimmed WAV export** from stem artifacts, scoped to the bound advisory arrangement planning window. This is **not** true song-section detection.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## What This Is

- An explicit export lane: **Section Window Export** on the Export screen
- Renders only the selected advisory section window from:
  - Source track `vocals.wav` stem artifact
  - Target track `no_vocals.wav` stem artifact
  - Active arrangement section context
  - Mash intent and pitch/time plan (bound or current session)
  - Mix settings (bound or current session)
  - Section start seconds when available
  - Section duration seconds (required)

## What This Is Not

- Not verse/chorus/drop/bridge/intro/outro **detection** — template language is advisory only
- Not sourced from combined preview WAV, MP3, or raw uploads
- Not auto-processing — user must click **Create section WAV export**
- No public sharing, cloud upload, downloader, or streaming integrations
- No distribution or publishing rights granted

## Context Diff Guard

Before export, the UI compares **bound section context** vs **current session**:

| Compared | Examples |
|----------|----------|
| Bound section context | Draft type, section label, phrase basis |
| Current session | Mash intent, mix settings, pitch/time plan, DJ overrides, stem artifact ids |

Statuses: `current`, `partially_stale`, `stale`, `unavailable`.

- Does **not** block export unless required data is missing (e.g. duration)
- **Stale** or **partially stale** requires explicit `confirm_stale_context`
- User chooses **bound settings** or **current settings** for mix/pitch at export time

## API

### `POST /v1/export/section-wav`

Key fields:

- `source_vocal_stem_artifact_id`, `target_instrumental_stem_artifact_id`
- `arrangement_context` (required, `export_context_mode: section_export`)
- `start_seconds`, `duration_seconds`
- `start_seconds_unavailable`, `confirm_start_from_artifact_beginning`
- `confirm_advisory_section_export`, `confirm_stale_context`
- `binding_freshness_status`, `settings_mode` (`bound` | `current`)
- Pitch/time + mix settings
- `loudness_target_mode`: `measurement_only` (default) or `normalize_section`

Response flags:

- `finalExport: true`
- `publicShare: false`
- `sectionTrimmedExport: true`
- `rights_notice`, warnings, limitations

Playback/download: `GET /v1/artifacts/exports/{id}/section-export`

Storage:

- `.work/artifacts/exports/{uuid}/section-export.wav`
- `.work/artifacts/exports/{uuid}/export.meta.json`

## Audio Pipeline

1. FFmpeg `-ss` / `-t` trim on both stem artifacts
2. Rubber Band on trimmed vocal stem
3. FFmpeg mix with Phase 18 mix settings
4. Optional `normalize_section` (prototype, clearly labeled)
5. ffprobe / loudness readout after export

If **start seconds unavailable**: export allowed only with user confirmation; labeled *Section start unavailable — exported from artifact start using section duration.*

If **duration unavailable**: export blocked with actionable error.

## Artifact Browser

Section exports appear as:

- Type: `export` / subtype: `section-wav`
- Section label, draft type, start/duration, phrase basis
- `binding_freshness_at_export` at creation time
- `finalExport: true`, `publicShare: false`

## Project Packages

Section-trimmed exports can be included in local project packages. Manifest and technical report carry arrangement context, warnings, and stale/current status at creation — without fake verse/chorus/drop claims.

See also: `docs/ARRANGEMENT_DRAFTS.md`, `docs/LOCAL_EXPORTS.md`, `docs/PROJECT_PACKAGE_EXPORT.md`.
