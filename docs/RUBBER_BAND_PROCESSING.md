# Rubber Band Processing — Phase 9

Phase 9 is the **first real audio processing proof** in MashLab AI / CyphaBlend AI. It produces short, user-initiated pitch/time **preview clips only** via Rubber Band CLI on the local sidecar.

## What This Phase Does

- Accepts a multipart audio upload on the local sidecar.
- Trims the clip with FFmpeg (default max **30 seconds**, hard limit **60 seconds**).
- Applies Rubber Band tempo and pitch transforms from the existing pitch/time plan.
- Stores a WAV preview artifact under `.work/artifacts/pitch-time-preview/`.
- Returns structured JSON with `audio_processed: true` when successful.

## What This Phase Does Not Do

- No Demucs or stem separation.
- No vocal/instrumental isolation.
- No layered mashup render (vocal over beat).
- No final export or mastering.
- No public sharing or downloader features.

The UI labels all output as **processed preview** — not a finished mashup.

## Requirements

| Tool | Role |
|------|------|
| **Rubber Band CLI** | Pitch shift (`-p`) and time stretch (`-t`) on trimmed WAV |
| **FFmpeg** | Trim/convert input to PCM WAV before Rubber Band |

Rubber Band must be on PATH as `rubberband`, `rubberband-cli`, `rubberband.exe`, or `rubberband-cli.exe`.

Detection is reported via `GET /v1/capabilities` (`rubberband` capability).

## Sidecar Endpoint

### `POST /v1/process/pitch-time-preview`

**Multipart form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | User-supplied audio upload |
| `tempo_ratio` | Optional* | Planning ratio `targetBpm / sourceBpm` |
| `source_bpm` | Optional* | Used with `target_bpm` if ratio omitted |
| `target_bpm` | Optional* | Used with `source_bpm` if ratio omitted |
| `pitch_shift_semitones` | No (default `0`) | Vocal pitch shift in semitones |
| `max_preview_seconds` | No (default `30`) | Preview trim length |
| `formant_preservation` | No (default `true`) | Adds Rubber Band `-F` when pitch ≠ 0 |

\* At least one actionable tempo or pitch adjustment is required.

**Success response highlights:**

- `status`: `preview_complete`
- `method`: `rubberband-cli preview`
- `audio_processed`: `true`
- `artifact_url`: `/v1/artifacts/pitch-time-preview/{id}`
- `limitations`: includes preview-only disclaimers

**Failure responses (structured, no crash):**

| Status | Meaning |
|--------|---------|
| `validation_error` | Invalid ratio, pitch, or no actionable change |
| `missing_dependency` | Rubber Band or FFmpeg not on PATH |
| `processing_failed` | Trim or Rubber Band subprocess failed |

### `GET /v1/artifacts/pitch-time-preview/{artifact_id}`

Serves the processed WAV for local playback in the browser UI.

## Artifact Storage

```text
.work/
  artifacts/
    pitch-time-preview/
      {uuid}.wav
  temp/
    preview-trim-{uuid}.wav   # deleted after processing
```

- Unique hex filenames per preview.
- Raw upload is saved only in temp during the request, then deleted.
- No long-term persistence of source audio beyond processing temp/artifacts.

## Tempo Ratio Mapping

Planning uses `tempo_ratio = targetBpm / sourceBpm`.

Rubber Band `-t` expects **output duration / input duration**, so the service sends `1 / tempo_ratio`.

Example: vocal 120 BPM → bed 128 BPM → ratio `1.067` → Rubber Band `-t 0.9372`.

## Frontend Behavior

Preview processing runs **only when the user clicks** “Create pitch/time preview”:

1. Local sidecar online
2. Rubber Band capability `available`
3. Plan has actionable tempo or pitch adjustment
4. Source track file available for the selected mash intent direction

For `compare_both`, each direction card has its own preview button. Only the **vocal/source track** for that direction is processed — not both tracks layered.

## Privacy Model

- Localhost-only sidecar (`127.0.0.1:47831`).
- No cloud upload.
- No training on user audio.
- User supplies audio and remains responsible for rights.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Troubleshooting

### Rubber Band missing

Symptom: `missing_dependency` with setup guidance.

Fix: Install [Rubber Band CLI](https://breakfastquay.com/rubberband/) and ensure the binary is on PATH. Planning and other analysis lanes still work without it.

### FFmpeg missing

Symptom: `missing_dependency` for FFmpeg.

Fix: Run `npm run check:local-engine` and install FFmpeg/ffprobe per platform guidance in `docs/LOCAL_ENGINE_SERVICE.md`.

### Unsupported input format

Symptom: `processing_failed` during FFmpeg trim.

Fix: Upload a common local audio format (WAV, MP3, FLAC, etc.) that FFmpeg can decode on your machine.

## Related Docs

- `docs/PITCH_TIME_PLANNING.md` — planning model and mash intent
- `docs/LOCAL_ENGINE_SERVICE.md` — sidecar overview and endpoints
