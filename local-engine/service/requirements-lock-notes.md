# Python sidecar requirements — lock notes (Windows MVP)

This project uses **requirement files** rather than a committed `pip freeze` lockfile. The sidecar venv is created locally and is gitignored.

## Base service

`requirements.txt` — FastAPI, uvicorn, pydantic (minimum versions).

## Optional lanes

| File | Packages | When |
|------|----------|------|
| `requirements-analysis.txt` | librosa, soundfile, numpy | BPM/key prototype |
| `requirements-stems.txt` | demucs, soundfile | Stem preview |
| `requirements-rhythm-linux.txt` | madmom/Essentia (Linux/WSL) | Verified rhythm only |

## Validated Windows CPU stack (Phase 31–34)

After install in `local-engine/service/.venv`:

| Package | Version |
|---------|---------|
| Python | 3.12.10 |
| torch | 2.5.1+cpu |
| torchaudio | 2.5.1+cpu |
| demucs | 4.0.1 |
| librosa | 0.11.0 |
| numpy | 2.4.6 |
| soundfile | 0.14.0 |

## Recording your lock snapshot

```powershell
cd local-engine/service
.\.venv\Scripts\pip freeze > ..\..\qa\full-local-workflow\phase-35\logs\pip-freeze.txt
```

Do **not** commit `pip-freeze.txt` if it includes machine-specific paths. The Phase 35 snapshot script captures version strings instead:

```powershell
npm run collect:release-versions
```

## Model weights

Demucs downloads **htdemucs** weights on first stem preview (~80MB) to the user torch hub cache. These are never committed to git.

## Restart after optional installs

After `npm run setup:analysis` or stem dependency changes:

```powershell
npm run sidecar:stop
npm run sidecar:start
```

Windows exit code **4294967295** after an external stop/restart is normal — not a startup failure.
