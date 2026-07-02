# DJ Remix Studio

Drop **two full songs**. The app isolates the **vocals** from one and the
**instrumental** from the other (AI stem separation), then automatically beat-
and key-matches them, lets you fine-tune the mashup, and exports a
professional-quality remix.

- **Frontend:** Next.js (App Router) + TypeScript + wavesurfer.js
- **Backend:** Python FastAPI + Demucs (stem separation) + librosa (analysis) + Rubber Band / librosa (time-stretch & pitch-shift)

## How it works

```
Song A (for vocals)          Song B (for the beat)
        │                            │
        ▼                            ▼
Demucs separation            Demucs separation
  → vocals stem                → instrumental (no-vocals) stem
        │                            │
        └───────────┬────────────────┘
                    ▼
Analyze each stem  ── BPM (librosa beat tracking)
                   ── Musical key (chroma + Krumhansl-Schmuckler)
                   ── First downbeat + waveform peaks
                    │
                    ▼
Match tempo  → time-stretch the acapella to the instrumental's BPM
Match key    → pitch-shift the acapella by the key difference (formant-preserving)
Align        → snap the acapella's downbeat to the instrumental's (+ manual offset)
Mix          → per-track gains, normalize + soft limiter
                    │
                    ▼
Download remix (MP3 / WAV)
```

Separation and analysis run in the background right after upload (with a
progress indicator). The remix first pass is automatic; you then fine-tune with
sliders (target tempo, vocal pitch, alignment offset, per-track volume) and
re-render.

If you already have isolated stems, tick **"Already isolated — skip
separation"** on a card to feed the file straight through without Demucs.

## Prerequisites

- **Python 3.12** (3.10+ should work)
- **Node.js 18+** and npm
- **ffmpeg** on your `PATH` (used to decode mp3/m4a/etc. and encode mp3 output)
- **Demucs** for stem separation — installed automatically via
  `requirements.txt` (it pulls in PyTorch, ~a few hundred MB). The first
  separation downloads the model weights (~80 MB) automatically. On a CPU-only
  machine, separating a full song can take from tens of seconds to a couple of
  minutes; a CUDA GPU is much faster. Set `DEMUCS_MODEL=mdx_extra_q` for a
  faster (quantized) model. Check `GET /api/health` (`"separation": true`).
- **Rubber Band CLI** (optional but recommended for best quality). If the
  `rubberband` executable is on your `PATH`, the app uses it automatically for
  high-quality stretching/pitch-shifting. If not, it falls back to librosa's
  phase vocoder (still works, slightly lower quality).
  - Windows: download the command-line utility from
    <https://breakfastquay.com/rubberband/> and add its folder to `PATH`.
  - macOS: `brew install rubberband`
  - Linux: `apt install rubberband-cli` (or your distro's equivalent)

Check whether Rubber Band was detected at `GET /api/health` (`"rubberband": true`).

## Setup & run

Run the backend and frontend in two terminals.

### 1. Backend (FastAPI, port 8000)

```bash
cd backend
python -m venv venv
# Windows PowerShell:
venv\Scripts\Activate.ps1
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (Next.js, port 3000)

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3000>.

> The frontend talks to the backend at `http://localhost:8000` by default. To
> point it elsewhere, copy `frontend/.env.local.example` to
> `frontend/.env.local` and set `NEXT_PUBLIC_API_BASE`.

## API

| Method | Endpoint                 | Description                                        |
| ------ | ------------------------ | ------------------------------------------------- |
| GET    | `/api/health`            | Status + whether Rubber Band and Demucs were detected |
| POST   | `/api/upload`            | Multipart `file` + `role` (`acapella`/`instrumental`) + optional `skip_separation`; returns `{ id, status }` and processes in the background |
| GET    | `/api/track/{id}`        | Track status (`stage`: `separating`/`analyzing`/`done`) + analysis when done |
| POST   | `/api/remix`             | JSON remix params; returns a `jobId`              |
| GET    | `/api/remix/{jobId}`     | Job status + result URLs when done                |
| GET    | `/api/result/{jobId}?fmt=mp3\|wav` | Download the mixed track                 |

`role` selects which stem to keep: `acapella` extracts the vocals, `instrumental`
extracts the accompaniment (full mix minus vocals).

## Tests

From the `backend/` directory (with the venv active):

```bash
# Pipeline smoke test (synthetic audio, no server needed)
python -m tests.smoke_test

# Demucs stem-separation test (downloads the model on first run)
python -m tests.separation_test

# HTTP integration test (start the server first, then in another terminal):
python -m tests.api_test

# Full HTTP test WITH separation (upload full songs → extract stems → remix):
python -m tests.api_separation_test
```

These write example material to `backend/samples/`.

## Notes & limitations

- Separation quality depends on the source track; Demucs is state-of-the-art
  but not perfect. For the cleanest results, use good-quality source songs.
- Automatic downbeat alignment is approximate; use the **Alignment offset**
  slider to nudge the vocals onto the beat if needed.
- Pitch shifts are clamped to ±6 semitones to protect vocal quality.
- Storage is in-memory + `backend/tmp/` and is not persisted across restarts
  (single-user, local use).

### Security

`npm audit` reports a moderate advisory for a `postcss` version bundled inside
Next.js's own toolchain. The suggested "fix" downgrades Next.js to v9 (a major
breaking change) and the issue does not affect this app's usage (we don't
process untrusted CSS), so it is intentionally left as-is.
