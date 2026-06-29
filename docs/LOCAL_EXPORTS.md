# Local WAV, MP3, Mastering, Mix Controls, and Project Package Exports (Phase 13–18)

MashLab AI / CyphaBlend AI supports **local WAV export** lanes, **MP3 reference export**, **mastering preset prototypes**, and **local project package export**. All exports are explicit, user-initiated, and rights-neutral.

## Export Lanes

| Lane | Endpoint | Source | Subtype |
|------|----------|--------|---------|
| Preview-length copy | `POST /v1/export/wav` | Combined preview `preview.wav` | `preview-copy` |
| Full-length re-render | `POST /v1/export/full-wav` | Stem artifacts + plan state | `full-wav` |
| Section window (Phase 23) | `POST /v1/export/section-wav` | Stem artifacts + bound section window | `section-wav` |
| MP3 reference | `POST /v1/export/mp3` | Existing WAV export `export.wav` | `mp3` |
| Mastering prototype | `POST /v1/master/wav` | Existing WAV export `export.wav` | preset id |
| Project package | `POST /v1/export/package` | Selected local artifacts | `folder` or `zip` |

Output:

- WAV export: `.work/artifacts/exports/{uuid}/export.wav` + `export.meta.json`
- Section window export: `.work/artifacts/exports/{uuid}/section-export.wav` + `export.meta.json`
- MP3 export: `.work/artifacts/exports/{uuid}/export.mp3` + `export.meta.json`
- Master: `.work/artifacts/masters/{uuid}/master.wav` (when preset creates audio) + `master.meta.json`
- Package: `.work/artifacts/packages/{uuid}/MashLab_Project_{label}/` + optional `mashlab-package.zip`

See `docs/MASTERING_PRESETS.md`, `docs/PROJECT_PACKAGE_EXPORT.md`, and `docs/SECTION_EXPORTS.md` for details.

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
3. Optional mix controls (Phase 18): per-track gain, fades, limiter safety, clipping guard — see `docs/MIX_CONTROLS.md`
4. Optional FFmpeg `loudnorm` when normalize mode selected
5. ffprobe/FFmpeg technical + loudness readout
6. Non-blocking loudness gate vs display targets (~ -14 LUFS / -1 dBTP)

### `POST /v1/export/full-wav`

Returns `processing_summary`, `input_summary`, `loudness_gate`, `finalExport: true`, `publicShare: false`, rights notice, warnings.

Missing Rubber Band, FFmpeg, or stem artifacts → structured `missing_dependency` / `missing_artifact` — no crash.

## Phase 13: Preview-Length Copy

### Input

- Existing combined-preview artifact only (`combined-preview/{id}/preview.wav`)

## What This Is Not

- Not full arrangement rendering (Phase 20 provides **planning-only** draft templates — see `docs/ARRANGEMENT_DRAFTS.md`)
- Not club mastering certification or public sharing
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
- `master / {preset}` — mastering prototype from WAV export

Full-length exports include source vocal and instrumental stem artifact ids. MP3 exports include `source_wav_export_artifact_id`. Master artifacts include preset and source WAV export id.

## Export Panel

The export panel unlocks when stem previews exist on both tracks **or** a combined-preview artifact exists.

Sections:

1. **Export from combined preview** — preview-length WAV copy (Phase 13)
2. **Full-length render from stem artifacts** — re-run Rubber Band + FFmpeg mix without trim (Phase 14)
3. **MP3 reference export** — unlocks when a WAV export exists (Phase 15)
4. **Mastering presets** — unlocks when a WAV export exists (Phase 16)

Full-length export requires readiness checklist: both stem artifacts, Rubber Band, FFmpeg, plan or confirmed neutral mode, rights acknowledgment.

MP3 and mastering sections require an existing WAV export artifact. Stem package and public sharing remain unavailable.

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
.work/artifacts/masters/{uuid}/master.wav         # Master output (Phase 16, when audio created)
.work/artifacts/masters/{uuid}/master.meta.json
```

## Cleanup

- `DELETE /v1/artifacts/{export_id}` removes export folder under `.work/artifacts/exports/` (WAV or MP3)
- Package artifacts delete under `.work/artifacts/packages/` only
- `DELETE /v1/artifacts?scope=session` clears previews, exports, masters, and packages
- Source uploads outside `.work` are never deleted

## Auto-Refresh

The artifact browser and export panel subscribe to a lightweight in-app refresh event fired after:

- Stem preview creation
- Combined preview creation
- Export creation
- Delete / clear session actions

See `src/lib/artifactRefresh.ts`.

## Arrangement Draft Export Hints (Phase 20)

When **Apply draft settings** is used on the Arrangement Plan panel:

- **Clean Blend** suggests preview-length WAV export (after combined preview exists).
- **Club Edit** suggests full-length WAV export when stem artifacts and plan state are ready.
- **Creative Blend** leaves export mode open (`either`).

The Export panel shows a notice when applied draft settings suggest an export lane. **No export runs automatically.** User must click the export button explicitly.

See `docs/ARRANGEMENT_DRAFTS.md`.

## Arrangement Context on Exports (Phase 22)

When a section binding exists, export requests may include `arrangement_context`:

| Export lane | Context behavior |
|-------------|------------------|
| Preview WAV copy | Inherits from combined preview meta or request payload |
| Full-length WAV | **Plan metadata only** — full render, not section-trimmed |
| MP3 / Master | Inherited from source WAV `export.meta.json` |
| Project package | `arrangement_contexts[]` in manifest; technical report lists advisory traceability |

UI shows stale/partially stale binding status. User can re-apply on Drafts or continue manually.

Notice on full-length export with context:

> Arrangement context only — full-length render. Section-only export is not implemented.

## Related Docs

- `docs/ARRANGEMENT_DRAFTS.md`
- `docs/EXPORT_AND_MASTERING_PLAN.md`
- `docs/PREVIEW_SESSION_MANAGEMENT.md`
- `docs/PROJECT_PACKAGE_EXPORT.md`
