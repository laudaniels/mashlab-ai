# Phase 34 — Release Documentation Pass

**Date:** 2026-06-30  
**Commit base:** `6b4fe6f` (initial Phase 34); continuation closes with evidence manifest + smoke logs  
**Platform:** Windows 11 Home build 26200

## Phase 34 completion status

| Task | Status |
|------|--------|
| One-command Windows start (`start:local:windows`) | **Complete** — smoke-tested with healthy sidecar |
| Optional librosa validation | **Complete** — re-validated 2026-06-30 |
| Manual UI screenshot evidence | **Documented** — automation blocked; manifest + capture checklist |
| Release documentation | **Complete** (this file + README + QA checklist) |
| Quality checks | **Pass** — lint, typecheck, 175 tests, build, runtime checks |

### Sidecar exit code note (Task 384497)

During Phase 34 librosa work, the venv sidecar **started cleanly**, served health checks for ~20 minutes, then exited with Windows code **4294967295** (`-1`) only because it was **stopped externally** for a librosa restart. This is **not** a dependency or startup failure. Do not treat that exit as a regression unless it occurs during an active run without an external stop.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Environment & dependency versions

| Component | Version |
|-----------|---------|
| Windows | 11 Home build **26200** |
| Python (sidecar venv) | **3.12.10** |
| PyTorch | **2.5.1+cpu** |
| Demucs | **4.0.1** |
| FFmpeg | N-125365-g9a01c1cb6a-20260630 |
| Rubber Band | **4.0.0** |
| librosa | **0.11.0** (optional, installed Phase 34) |
| numpy | **2.4.6** |
| soundfile | **0.14.0** |

## One-command local start

```powershell
npm run start:local:windows
```

### Behavior

1. **Preflight** — verifies sidecar venv, FFmpeg, ffprobe (exits 1 if any missing)
2. **Sidecar** — `npm run sidecar:start` (skips if already healthy; no duplicate instances)
3. **Prints URLs:**
   - App: http://127.0.0.1:5173/
   - Health: http://127.0.0.1:47831/health
   - Capabilities: http://127.0.0.1:47831/v1/capabilities
4. **Vite** — opens `npm run dev` in a **new PowerShell window** (reliable on Windows)
5. **Next steps** — upload two tracks, follow session checklist (user-initiated only)

Preflight-only alternative:

```powershell
npm run setup:windows:check:strict
npm run sidecar:status
```

## Librosa validation result

**Install:** `npm run setup:analysis` — **PASS**

| Check | Result |
|-------|--------|
| librosa capability | **PASS** — 0.11.0 |
| POST /v1/analyze/beat | **PASS** — BPM/beat times on synthetic WAV |
| POST /v1/analyze/key | **PASS** — experimental key estimate |
| POST /v1/analyze/phrases | **PASS (expected limitation)** — sine test clip has no beat grid; message: "No beat times available" — not a missing_dependency |

Logs: `qa/full-local-workflow/phase-34/logs/`

After librosa install, restart sidecar: `npm run sidecar:stop` (if pid recorded) or stop process on 47831, then `npm run sidecar:start`.

Validate: `npm run validate:analysis-lane`

**Re-validation (2026-06-30):** `npm run validate:analysis-lane` — all four steps **PASS** with sidecar pid 33836. Log: `qa/full-local-workflow/phase-34/logs/validate-analysis-lane-rerun.txt`

## `start:local:windows` confirmation

Smoke-tested 2026-06-30 with sidecar already healthy:

| Step | Result |
|------|--------|
| Preflight (venv, FFmpeg, ffprobe) | **PASS** |
| Sidecar start | **Skipped** — already healthy at 47831 |
| URLs printed (app, health, capabilities) | **PASS** |
| Vite in new PowerShell window | **PASS** |
| Exit code | **0** |

Log: `qa/full-local-workflow/phase-34/logs/start-local-windows-smoke.txt`

## Manual UI screenshots

**Status:** Not captured in automation — manual pass required. Evidence manifest documents automation attempts and substitute API validation.

See: `qa/full-local-workflow/phase-34/screenshots/README.md`  
Manifest: `qa/full-local-workflow/phase-34/screenshots/EVIDENCE_MANIFEST.md`

| Screen | Status |
|--------|--------|
| First-run guidance | Manual required |
| Upload (2 tracks) | Manual required |
| Local Engine Status | Manual required |
| Workflow checklist | Manual required |
| Analysis screen | Manual required |
| Stems / combined / export | Manual required |
| Artifact browser / package | Manual required |

**Why:** Cursor browser MCP returns blank React DOM. Do not fake screenshots.

## Demo flow (Windows)

1. `npm install`
2. `npm run setup:windows:check`
3. `npm run start:local:windows`
4. Open http://127.0.0.1:5173/
5. Upload two synthetic/non-copyright tracks
6. Run analysis (librosa BPM/key if installed)
7. Create stem previews (user click, both tracks)
8. Combined preview → export → package (user-initiated each step)
9. `npm run sidecar:status` to verify sidecar health

Full API chain validated in Phase 32: `docs/PHASE_32_FULL_LOCAL_QA.md`

## Known limitations

- No public sharing, cloud upload, downloader, or streaming integrations
- librosa BPM/key is experimental — DJ review required
- Phrase analysis needs detectable beats (not pure sine test tones)
- Mastering/mix limiter prototypes — not certification
- Manual UI PNG captures pending (documented in EVIDENCE_MANIFEST; API/librosa evidence complete)
- Global `python` not on agent PATH — venv scripts cover checks

## Rights / legal confirmation

- Neutral private audio-processing tool; user supplies audio and holds rights
- Required notice in app, export, package (`RIGHTS_NOTICE.txt`)
- `public_share: false` on all exports
- No publishing-rights claims

## Related commands

```powershell
npm run sidecar:status
npm run sidecar:stop
npm run setup:analysis
npm run validate:analysis-lane
npm run setup:windows:check:strict
npm run check:python-service
```

## Recommended next phase

**Phase 35 — Release packaging:** pinned dependency manifest, manual screenshot completion, optional signed Windows zip of demo assets (no model weights), and CI job running venv-aware checks.
