# Local Engine Service

MashLab AI / CyphaBlend AI is local-first. Heavy audio work should run in a user-controlled local process, not in silent cloud uploads.

## Current State

- The browser app performs metadata inspection with Web Audio and media element probes.
- MIR, stems, arrangement, and export remain adapter placeholders.
- A future local service will own FFmpeg, Python MIR tooling, Demucs, and Rubber Band.

## Recommended Service Shape

```text
local-engine/
  README.md
  check-binaries.mts
  service/                 # future Python or Rust worker
  artifacts/               # gitignored job output workspace
```

### HTTP or IPC Boundary

The frontend should submit explicit user-approved jobs to a local endpoint such as `http://127.0.0.1:47831/v1/jobs`.

Each job request includes:

- `sessionId`
- `trackSlotId`
- `phase` (`metadata`, `beat`, `key`, `stems`, `pitch-time`, `vocal-cleanup`, `arrangement`, `export`)
- `inputPath` or approved file handle
- `options` (non-secret processing flags only)

Each job response includes:

- `jobId`
- `state` (`queued`, `running`, `complete`, `failed`, `cancelled`)
- `status` (`implemented`, `analysis-coming-next`, `engine-pending`)
- `message`
- `artifacts[]` (paths/URLs for previews, JSON analysis, stems, exports)

## FFmpeg / ffprobe Path

Use ffprobe for container metadata when browser decode is insufficient.

Detection command:

```bash
npm run check:local-engine
```

If binaries are missing, the service should return a setup message instead of failing silently.

Suggested install guidance:

- Windows: install FFmpeg and ensure `ffmpeg` and `ffprobe` are on `PATH`.
- macOS: `brew install ffmpeg`
- Linux: package manager install for `ffmpeg`

## Planned Engine Integrations

| Lane | Primary target | Notes |
|------|----------------|-------|
| Metadata | ffprobe + browser fallback | Real today in browser; ffprobe adds bitrate/container detail |
| Beat / phrase | BeatNet+, Essentia, librosa prototype | Return BPM confidence and bar markers |
| Key / harmony | Essentia / librosa key detectors | Camelot mapping and pitch-shift guardrails |
| Stems | Demucs / HTDemucs | MDX-Net and UVR-style options later |
| Pitch / time | Rubber Band CLI | SoundTouch fallback for lightweight previews; **planning endpoint available** |

## Implemented Sidecar Endpoints (Current)

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Service identity |
| `GET /v1/capabilities` | FFmpeg, librosa, **Rubber Band CLI** detection |
| `POST /v1/jobs` | Job queue (metadata, beat, key) |
| `POST /v1/analyze/metadata` | ffprobe metadata |
| `POST /v1/analyze/beat` | librosa beat prototype |
| `POST /v1/analyze/key` | librosa key prototype |
| `POST /v1/plan/pitch-time` | Planning-only tempo/key strategy from JSON summaries (no audio) |
| `POST /v1/process/pitch-time-preview` | **Rubber Band preview clip** from multipart upload (user-initiated) |
| `GET /v1/artifacts/pitch-time-preview/{id}` | Serve processed preview WAV from local workspace |
| `POST /v1/process/stem-preview` | **Demucs two-stem preview** (vocals + no_vocals, user-initiated) |
| `GET /v1/artifacts/stems/{id}/vocals` | Serve vocals stem preview WAV |
| `GET /v1/artifacts/stems/{id}/no_vocals` | Serve instrumental (no_vocals) stem preview WAV |
| `POST /v1/process/combined-preview` | **Combined vocal-over-instrumental preview** (Rubber Band + FFmpeg mix) |
| `GET /v1/artifacts/combined-preview/{id}/preview` | Serve combined preview WAV |

Rubber Band is detected via `rubberband`, `rubberband-cli`, `rubberband.exe`, or `rubberband-cli.exe` on PATH. Status is `available` or `missing`. Browser-only planning works when Rubber Band is absent; pitch/time and combined preview processing require Rubber Band and FFmpeg.

Demucs readiness requires both the `demucs` Python package and `torch`. First run may download model weights locally. See `docs/STEM_SEPARATION.md`.

Preview artifacts are stored under `.work/artifacts/pitch-time-preview/`, `.work/artifacts/stems/{uuid}/`, and `.work/artifacts/combined-preview/{uuid}/`. Raw uploads are not kept beyond temp processing. See `docs/RUBBER_BAND_PROCESSING.md`, `docs/STEM_SEPARATION.md`, and `docs/COMBINED_PREVIEW.md`.

## Planned Engine Integrations (Future Lanes)

| Lane | Primary target | Notes |
|------|----------------|-------|
| Stems | Demucs / HTDemucs | MDX-Net and UVR-style options later |
| Vocal cleanup | Deterministic DSP chain | User-controlled gain/EQ/comp/de-ess/space |
| Arrangement | Phrase-aware draft generator | Clean Blend, Club Edit, Creative Blend |
| Export | FFmpeg + loudness/true-peak checks | WAV primary; MP3 optional |

## Privacy Rules

- No silent upload of user audio.
- No training on user uploads.
- Any file movement outside the browser must be explicit in UI copy and settings.
- Artifacts stay in a local workspace until the user exports or deletes them.

## Next Implementation Step

1. Add a minimal Python FastAPI or Node sidecar that exposes `/health` and `/v1/jobs`.
2. Implement ffprobe metadata adapter behind the same job contract as the browser metadata lane.
3. Add BPM/key prototype endpoints before Demucs integration.
