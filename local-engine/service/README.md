# MashLab Local Engine Service

Private **localhost-only** helper for MashLab AI / CyphaBlend AI.

This is **not** a cloud API. It runs on your machine, binds to `127.0.0.1` by default, and processes audio you explicitly upload to it from the MashLab app.

## Privacy and Legal

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

- No streaming imports
- No downloader
- No public sharing hub
- No training on user uploads
- Files are written to a local `.work/temp` folder only for the duration of a request

## Requirements

- Python 3.11+ recommended
- Optional but recommended: FFmpeg with `ffprobe` on `PATH`

## Windows Setup

From repo root:

```powershell
cd local-engine\service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 47831
```

Then open the MashLab Vite app separately:

```powershell
cd ..\..
npm run dev
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service liveness and privacy notice |
| GET | `/v1/capabilities` | Python/ffmpeg/librosa/Essentia/torch/Demucs/Rubber Band detection |
| POST | `/v1/jobs` | Queue a typed local job |
| GET | `/v1/jobs/{job_id}` | Read job status |
| POST | `/v1/analyze/metadata` | Upload a local audio file for ffprobe metadata |

## Capability Statuses

- `available` — detected and usable now
- `missing` — required tool not found (example: ffprobe)
- `not_configured` — optional package not installed
- `planned` — future MashLab phase, not required yet

## ffprobe Troubleshooting

If metadata analysis returns a setup guidance message:

1. Install FFmpeg.
2. Ensure both `ffmpeg` and `ffprobe` are on `PATH`.
3. Restart the service in a new terminal so PATH changes apply.
4. Run from repo root: `npm run check:local-engine`

The browser MVP continues to work without ffprobe using Web Audio metadata only.

## Manual Smoke Test

With the service running:

```powershell
curl http://127.0.0.1:47831/health
curl http://127.0.0.1:47831/v1/capabilities
```

Upload a local WAV you own:

```powershell
curl -F "file=@C:\path\to\your\authorized-track.wav" http://127.0.0.1:47831/v1/analyze/metadata
```

If ffprobe is missing, the response stays structured and includes setup guidance instead of crashing.

## Python Checks

```powershell
python -m py_compile main.py capabilities.py metadata.py jobs.py models.py config.py
python -m unittest discover -s tests -p "test_*.py"
```

## What Works in This Phase

- Health and capability detection
- Job create/read skeleton
- ffprobe metadata when available
- Graceful structured errors when ffprobe is missing

## Not Implemented Yet

- BPM / key analysis
- Stem separation
- Arrangement drafts
- Export/mastering
