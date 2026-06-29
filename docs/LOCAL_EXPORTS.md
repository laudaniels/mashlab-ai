# Local WAV Exports (Phase 13)

Phase 13 adds the first **local WAV export prototype** for MashLab AI / CyphaBlend AI. Exports are explicit, user-initiated, and rights-neutral.

## Scope

- **Input:** existing combined-preview artifact only (`combined-preview/{id}/preview.wav`)
- **Output:** local WAV export artifact at `.work/artifacts/exports/{uuid}/export.wav`
- **Format:** WAV only (no MP3 in this phase)
- **No auto-export:** user must click **Create local WAV export**
- **No public sharing:** `publicShare: false` on all export responses
- **No distribution rights granted**

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

They include `source_combined_preview_artifact_id` when metadata is available.

## Export Panel

The export panel unlocks when at least one combined-preview artifact exists. It provides:

- Combined preview source selector
- Optional export label
- Loudness mode selector (measurement vs normalize preview copy)
- **Create local WAV export** button
- Playback + download link for the result
- Rights notice and limitation warnings

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
