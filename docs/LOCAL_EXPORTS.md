# Local WAV Exports (Phase 13–14)

MashLab AI / CyphaBlend AI supports **local WAV export** lanes. All exports are explicit, user-initiated, and rights-neutral.

## Export Lanes

| Lane | Endpoint | Source | Subtype |
|------|----------|--------|---------|
| Preview-length copy | `POST /v1/export/wav` | Combined preview `preview.wav` | `preview-copy` |
| Full-length re-render | `POST /v1/export/full-wav` | Stem artifacts + plan state | `full-wav` |

Output for both: `.work/artifacts/exports/{uuid}/export.wav` + `export.meta.json`

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
- Not MP3, stem package export, club mastering, or public sharing
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

- `preview-copy` — copied from combined preview
- `full-wav` — re-rendered from stem artifacts

Full-length exports include source vocal and instrumental stem artifact ids.

## Export Panel

The export panel unlocks when stem previews exist on both tracks **or** a combined-preview artifact exists.

Sections:

1. **Export from combined preview** — preview-length WAV copy (Phase 13)
2. **Full-length render from stem artifacts** — re-run Rubber Band + FFmpeg mix without trim (Phase 14)

Full-length export requires readiness checklist: both stem artifacts, Rubber Band, FFmpeg, plan or confirmed neutral mode, rights acknowledgment.

MP3, stem package, mastering presets, and public sharing remain unavailable.

## Storage Layout

```text
.work/artifacts/combined-preview/{id}/preview.wav   # source (Phase 11)
.work/artifacts/exports/{uuid}/export.wav           # output (Phase 13)
.work/artifacts/exports/{uuid}/export.meta.json     # source id, label, mode
```

## Cleanup

- `DELETE /v1/artifacts/{export_id}` removes export folder under `.work/artifacts/exports/`
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
