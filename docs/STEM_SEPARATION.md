# Stem Separation Preview — Phase 10

Phase 10 adds **user-initiated Demucs two-stem preview separation** on the local sidecar. Output is preview-only, local-only, and explicitly triggered by the user.

## What This Phase Does

- Accepts one multipart audio upload per request.
- Split mode: **`vocals_no_vocals` only** (Demucs `--two-stems vocals`).
- Trims input with FFmpeg (default **60 seconds**, max **180 seconds**) before separation.
- Saves artifacts locally:
  - `.work/artifacts/stems/{uuid}/vocals.wav`
  - `.work/artifacts/stems/{uuid}/no_vocals.wav`
- Returns structured JSON with playback URLs for both stems.

## What This Phase Does Not Do

- No 4-stem drums/bass/other export lane yet.
- No batch/library processing.
- No full mashup rendering or layered vocal-over-beat preview.
- No final export or mastering.
- No public sharing.
- **No claim of studio-quality output** — Demucs preview is heuristic.

## Requirements

| Dependency | Role |
|------------|------|
| **Demucs** | Two-stem vocal separation |
| **PyTorch** | Required runtime for Demucs |
| **FFmpeg** | Trim/normalize preview input clip |

Install in the sidecar virtual environment:

```powershell
cd local-engine\service
.\.venv\Scripts\Activate.ps1
pip install -r requirements-stems.txt
```

Optional file: `local-engine/service/requirements-stems.txt`

```text
demucs>=4.0.0
torch
```

**Model download:** First successful run may download HTDemucs (or default model) weights into the local PyTorch/Demucs cache on the user's machine. This is normal and stays local.

Capability status is reported via `GET /v1/capabilities` (`demucs` entry requires both Demucs and PyTorch).

## Sidecar Endpoints

### `POST /v1/process/stem-preview`

**Multipart form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | One uploaded track |
| `split_mode` | No (default `vocals_no_vocals`) | Phase 10 supports this mode only |
| `max_preview_seconds` | No (default `60`) | Preview trim length |

**Success highlights:**

- `status`: `preview_complete`
- `method`: `demucs-two-stems-vocals`
- `audio_processed`: `true`
- `vocals.artifact_url`: `/v1/artifacts/stems/{id}/vocals`
- `no_vocals.artifact_url`: `/v1/artifacts/stems/{id}/no_vocals`

**Structured failures:**

| Status | Meaning |
|--------|---------|
| `validation_error` | Invalid split mode or preview duration |
| `missing_dependency` | Demucs, PyTorch, or FFmpeg unavailable |
| `processing_failed` | FFmpeg trim or Demucs subprocess failed |

### Artifact playback

- `GET /v1/artifacts/stems/{artifact_id}/vocals`
- `GET /v1/artifacts/stems/{artifact_id}/no_vocals`

## Artifact Storage

```text
.work/
  artifacts/stems/{uuid}/
    vocals.wav
    no_vocals.wav
  temp/
    stem-trim-{uuid}.wav        # deleted after processing
    stem-demucs-{uuid}/         # deleted after processing
```

Raw uploads are not kept beyond request temp handling.

## Frontend Behavior

On the **Stem separation** screen:

1. User selects Track A or Track B.
2. User clicks **Create vocal/instrumental preview**.
3. UI shows Demucs dependency status, loading state, and two `<audio>` players after success.

Preview does **not** run automatically after upload. Job queue stem adapter remains `engine-pending`.

## Privacy and Rights

- Localhost-only processing.
- No cloud upload or training on user audio.
- User supplies audio and remains responsible for rights.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Troubleshooting

### Demucs missing

Install `demucs` and `torch` in the sidecar venv. Restart uvicorn and check `/v1/capabilities`.

### PyTorch missing but Demucs installed

Capability reports Demucs missing with guidance to install torch.

### Slow first run

Model weight download and CPU/GPU inference can take several minutes on first preview. Keep max preview duration at 60s for testing.

## Related Docs

- `docs/LOCAL_ENGINE_SERVICE.md`
- `docs/RUBBER_BAND_PROCESSING.md`
- `docs/COMBINED_PREVIEW.md` — vocal-over-instrumental mix using stem artifacts
