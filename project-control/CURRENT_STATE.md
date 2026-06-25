# MashLab AI / CyphaBlend AI — Current State

**Recorded:** 2026-06-25

## Repository
| Field | Value |
|-------|--------|
| Local path | `C:\Users\dimit\Documents\Codex\2026-06-23\files-mentioned-by-the-user-you-4` |
| Folder alias | Codex export folder name `files-mentioned-by-the-user-you-4` — consider renaming checkout for clarity |
| Remote | *None configured* |
| Current branch | `master` |
| Latest commit | `91cbb3a` — Add session artifacts and timeline planning |
| Working tree | Clean (pre reset docs) |

## Stack
- Vite + React + TypeScript frontend
- Browser Web Audio for local metadata/waveform prototype
- Optional Python sidecar at `local-engine/service/` (FastAPI/uvicorn on port 47831)
- Plain CSS pro-audio shell

## Implemented (high level)
- Two-track upload, validation, waveform summaries
- Sequential job queue, beat/key lanes with sidecar when librosa available
- Mashup planning panel, harmonic compatibility planner, timeline alignment UI
- Session-scoped in-memory artifacts and DJ override controls

## Not implemented yet
- True downbeat/phrase detection (BeatNet+ / Essentia path documented)
- Stem separation, AI arrangement, pitch/time processing, vocal cleanup, mastering, export rendering

## Live / preview URLs
| Surface | URL |
|---------|-----|
| Local dev | Vite dev server (default port from `npm run dev`) |

## Known risks
- Awkward Codex folder name obscures project identity in file searches
- No git remote — backup/tag locally until GitHub repo is created
- Large tree (~8500 files) — exclude `node_modules` from broad scans

## Validation (not re-run in reset pass)
README documents: `npm run lint`, `typecheck`, `build`, `test`, `check:local-engine`, Python service checks
