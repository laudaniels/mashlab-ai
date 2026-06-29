# Local WAV and MP3 Exports (Phase 13–15)

MashLab AI / CyphaBlend AI supports **local WAV export** lanes and **MP3 reference export** from existing WAV exports. All exports are explicit, user-initiated, and rights-neutral.

## Export Lanes

| Lane | Endpoint | Source | Subtype |
|------|----------|--------|---------|
| Preview-length copy | `POST /v1/export/wav` | Combined preview `preview.wav` | `preview-copy` |
| Full-length re-render | `POST /v1/export/full-wav` | Stem artifacts + plan state | `full-wav` |
| MP3 reference | `POST /v1/export/mp3` | Existing WAV export `export.wav` | `mp3` |

Output:

- WAV: `.work/artifacts/exports/{uuid}/export.wav` + `export.meta.json`
- MP3: `.work/artifacts/exports/{uuid}/export.mp3` + `export.meta.json`

## Phase 15: MP3 Reference Export

### Input (WAV export artifact only)

MP3 export **must** use an existing local WAV export artifact. It does **not** encode from raw uploads, stem artifacts, or combined preview directly.

Request body:

```json
{
  "source_wav_export_artifact_id": "abc123",
  "bitrate_kbps": 320,
  "export_label": "Optional label"
}
```

| Bitrate | Status |
|---------|--------|
| 320 kbps | Default |
| 256 kbps | Optional |
| 192 kbps | Optional |

### `POST /v1/export/mp3`

- Validates artifact id and ensures source is a WAV export (not MP3)
- Encodes with FFmpeg `libmp3lame`
- Runs ffprobe/technical + loudness readout after encode (honest `not_available` when unavailable)
- Returns `finalExport: true`, `publicShare: false`, rights notice, warnings/limitations
- **No public share links**

Playback/download: `GET /v1/artifacts/exports/{id}/export.mp3`

MP3 artifacts are labeled:

> Local MP3 reference export — user responsible for rights. No public distribution rights granted.

Warnings include: *MP3 is a reference/export format, not proof of distribution rights.* and *MP3 is not a mastered club version.*

## Phase 14: Full-Length Export

### Input (stem artifacts only — not raw uploads, not preview.wav)

- Source vocal stem artifact id → `stems/{id}/vocals.wav`
- Target instrumental stem artifact id → `stems/{id}/no_vocals.wav`
- Mash intent (`vocal_a_over_beat_b` / `vocal_b_over_beat_a`)
- Tempo ratio, pitch shift semitones, alignment offset ms
- Optional BPM values from session plan
- `neutral_processing` + `confirm_neutral_settings` when plan data missing
- Optional `max_test_seconds` for automated testing only (not default production)

### Pipeline

1. Rubber Band on full vocal stem (pitch/time)
2. FFmpeg align + mix with target `no_vocals` stem (no preview duration trim by default)
3. Optional FFmpeg `loudnorm` when normalize mode selected
4. ffprobe/FFmpeg technical + loudness readout
5. Non-blocking loudness gate vs display targets (~ -14 LUFS / -1 dBTP)

### `POST /v1/export/full-wav`

Returns `processing_summary`, `input_summary`, `loudness_gate`, `finalExport: true`, `publicShare: false`, rights notice, warnings.

Missing Rubber Band, FFmpeg, or stem artifacts → structured `missing_dependency` / `missing_artifact` — no crash.

## Phase 13: Preview-Length Copy

### Input

- Existing combined-preview artifact only (`combined-preview/{id}/preview.wav`)

## What This Is Not

- Not full arrangement rendering or full-length mastering
- Not stem package export, club mastering, or public sharing
- MP3 is a lossy reference format — not proof of distribution rights
- Not a claim that the user may publish or distribute the output

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Sidecar Endpoint

### `POST /v1/export/wav`

Request body:

```json
{
  "source_combined_preview_artifact_id": "abc123",
  "export_format": "wav",
  "export_label": "Optional label",
  "loudness_target_mode": "measurement_only"
}
```

`loudness_target_mode`:

| Mode | Behavior |
|------|----------|
| `measurement_only` (default) | Copy combined preview WAV; measure loudness/technical readout after export |
| `normalize_preview` | Apply FFmpeg `loudnorm` to the preview copy only — **prototype normalization, not full mastering** |

Response highlights:

- `export_artifact_id`
- `source_combined_preview_artifact_id`
- `artifact_url` / `download_url` → `GET /v1/artifacts/exports/{id}/export`
- Technical readout (duration, sample rate, channels, codec, file size)
- Loudness readout when FFmpeg/ffprobe available (honest `not_available` / `partial` when not)
- `finalExport: true`
- `publicShare: false`
- `rights_notice`
- `warnings` / `limitations`

Validation errors:

- Invalid or missing combined-preview source
- Non-WAV `export_format`
- Path traversal in artifact ids

### Playback / download

`GET /v1/artifacts/exports/{artifact_id}/export`

Serves the local export WAV with a download-friendly filename.

## Artifact Browser

Export artifacts appear with type `export` and label:

> Local export — user responsible for rights. No public distribution rights granted.

Export artifacts in the browser show `export_subtype`:

- `preview-copy` — copied from combined preview (`export / wav`)
- `full-wav` — re-rendered from stem artifacts (`export / full-wav`)
- `mp3` — encoded from WAV export (`export / mp3`)

Full-length exports include source vocal and instrumental stem artifact ids. MP3 exports include `source_wav_export_artifact_id`.

## Export Panel

The export panel unlocks when stem previews exist on both tracks **or** a combined-preview artifact exists.

Sections:

1. **Export from combined preview** — preview-length WAV copy (Phase 13)
2. **Full-length render from stem artifacts** — re-run Rubber Band + FFmpeg mix without trim (Phase 14)
3. **MP3 reference export** — unlocks when a WAV export exists; user selects WAV source + bitrate (Phase 15)

Full-length export requires readiness checklist: both stem artifacts, Rubber Band, FFmpeg, plan or confirmed neutral mode, rights acknowledgment.

MP3 section requires an existing WAV export artifact. Stem package, mastering presets, and public sharing remain unavailable.

### Export session UX (Phase 15)

Local-only preferences in `localStorage` (`src/lib/exportSession.ts`):

- Last export mode (preview WAV / full WAV / MP3 reference)
- Last MP3 bitrate
- Last loudness mode (preview + full-length)
- Last successful export summary
- **Re-export with current settings** when safe (explicit user action)

No raw audio is persisted. No accounts or cloud storage.

## Storage Layout

```text
.work/artifacts/combined-preview/{id}/preview.wav   # source (Phase 11)
.work/artifacts/exports/{uuid}/export.wav           # WAV output (Phase 13–14)
.work/artifacts/exports/{uuid}/export.mp3           # MP3 output (Phase 15)
.work/artifacts/exports/{uuid}/export.meta.json     # source ids, label, mode, bitrate
```

## Cleanup

- `DELETE /v1/artifacts/{export_id}` removes export folder under `.work/artifacts/exports/` (WAV or MP3)
- `DELETE /v1/artifacts?scope=session` clears previews **and** exports
- Source uploads outside `.work` are never deleted

## Auto-Refresh

The artifact browser and export panel subscribe to a lightweight in-app refresh event fired after:

- Stem preview creation
- Combined preview creation
- Export creation
- Delete / clear session actions

See `src/lib/artifactRefresh.ts`.

## Related Docs

- `docs/EXPORT_AND_MASTERING_PLAN.md`
- `docs/PREVIEW_SESSION_MANAGEMENT.md`
- `docs/COMBINED_PREVIEW.md`
