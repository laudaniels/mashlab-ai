# Phase 35 demo release package recipe

Optional small ZIP for reviewers — **no copyrighted audio, model weights, or tool binaries**.

## Create the package

```powershell
npm run collect:release-versions
npm run package:demo-release
```

Output: `mashlab-local-mvp-demo-package.zip` (this folder)

## Contents

- Release docs (`docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md`, `docs/RELEASE_DEPENDENCIES_WINDOWS.md`)
- QA JSON/TXT logs from phases 32, 34, 35
- Screenshot manifest + any captured PNGs
- `RIGHTS_NOTICE.txt` and `START_INSTRUCTIONS.txt`

## Synthetic test audio (generate locally)

Not bundled — generate on demand:

```powershell
powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1
```

Creates `qa/full-local-workflow/phase-32/test-audio/track-a-vocal-like-15s.wav` and `track-b-instrumental-15s.wav` via FFmpeg lavfi (non-copyright).

## Size limit

Script aborts if staged content exceeds **5MB**. Logs and docs only — no WAVs or zips of artifacts.

## Start instructions (included in ZIP)

```powershell
npm install
npm run start:local:windows
```

Open http://127.0.0.1:5173/

## Legal

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

No public sharing. No cloud upload.
