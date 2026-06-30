# Phase 33 — Production Hardening + Runtime Reliability

**Goal:** Make the Windows local MVP easier to run, verify, and document for release.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## What changed

### Venv-aware Python checks

| Script | Behavior |
|--------|----------|
| `npm run check:python-service` | `py_compile` all service modules — **prefers sidecar venv** when global `python` is missing |
| `npm run check:python-service:test` | `unittest discover` in `local-engine/service/tests` — same resolution |
| `npm run check:python-service:venv` | Force sidecar venv only |
| `npm run check:python-service:test:venv` | Force venv unittest only |

If neither global Python nor `.venv` exists, scripts print actionable setup guidance and exit 1.

### Strict Windows setup check

`npm run setup:windows:check:strict` now passes when:

- FFmpeg **and** ffprobe are on PATH
- **Either** global `python` **or** sidecar venv Python exists (venv satisfies the Python processing tier)

Demucs/librosa remain informational unless missing blocks your workflow.

### Single-instance sidecar launcher

| Script | Purpose |
|--------|---------|
| `npm run sidecar:status` | Health check + recorded pid from `.work/sidecar-status.json` |
| `npm run sidecar:start` | Skip if healthy; refuse if port 47831 occupied by unknown process; start venv uvicorn |
| `npm run sidecar:stop` | Stop only when `/health` identifies MashLab; uses recorded pid |

Status file: `local-engine/service/.work/sidecar-status.json` (gitignored).

**External stop:** Windows exit `4294967295` (-1) means the process was killed externally — not a failed install. Confirm with `npm run sidecar:status`.

### Optional analysis setup

```powershell
npm run setup:analysis:dry-run   # show planned pip command
npm run setup:analysis           # pip install -r requirements-analysis.txt in venv
```

Installs **librosa**, **soundfile**, **numpy** into the sidecar venv. Optional — browser MVP works without it. Enables BPM/key/heuristic phrase from audio.

## Full local MVP run (Windows)

```powershell
npm install
npm run setup:windows:check
npm run sidecar:start
npm run dev
```

Open http://127.0.0.1:5173 — load two tracks, follow session checklist (user-initiated steps only).

Verify processing:

```powershell
npm run check:local-engine
npm run check:python-service
npm run check:python-service:test
curl.exe http://127.0.0.1:47831/v1/capabilities
```

## Troubleshooting port 47831

| Symptom | Action |
|---------|--------|
| `sidecar:status` → healthy | No action — sidecar running |
| `sidecar:start` → already running | Expected — use existing instance |
| Port occupied, health fails | Another app holds 47831 — stop it manually |
| Exit 4294967295 after run | External kill — run `npm run sidecar:status` and restart if needed |
| Duplicate sidecars | Use `npm run sidecar:stop` then `npm run sidecar:start` |

## Manual UI screenshots

Cursor browser automation did not render the React/Vite DOM (blank capture). Manual screenshots for release docs:

1. First-run guidance panel
2. Local Engine Status (FFmpeg, Rubber Band, Demucs, PyTorch available)
3. Upload screen with two tracks
4. Session workflow checklist
5. Artifact browser (after Phase 32 QA artifacts)
6. Export / master / package panels

Save under: `qa/full-local-workflow/phase-33/screenshots/`

Do not fake screenshots — capture from a real browser session.

## Quality commands (Phase 33)

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-engine
npm run setup:windows:check
npm run setup:windows:check:strict
npm run check:python-service
npm run check:python-service:test
npm run check:python-service:venv
npm run check:python-service:test:venv
```

## Related docs

- `docs/WINDOWS_RUNTIME_SETUP.md`
- `docs/LOCAL_ENGINE_SERVICE.md`
- `docs/QA_WORKFLOW_CHECKLIST.md`
- `docs/PHASE_32_FULL_LOCAL_QA.md`
