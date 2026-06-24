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
| Pitch / time | Rubber Band CLI | SoundTouch fallback for lightweight previews |
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
