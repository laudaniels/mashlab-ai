# Phase 34 UI screenshot evidence manifest

**Updated:** 2026-06-30 (Phase 34 continuation)  
**Sidecar:** healthy at http://127.0.0.1:47831 (pid 33836)  
**App (local):** http://127.0.0.1:5173/ when `npm run dev` is running

Upload audio you own or are authorized to use. Do not use copyrighted examples in release captures.

## Summary

| Category | Status |
|----------|--------|
| API / librosa validation | **Complete** — see `../logs/` |
| `start:local:windows` smoke | **Complete** — see `../logs/start-local-windows-smoke.txt` |
| Automated UI screenshots | **Blocked** — see automation log below |
| Manual PNG captures | **Pending** — operator must capture in a normal desktop browser |

**Do not commit blank or fabricated screenshots.** Phase 33 reference: `qa/full-local-workflow/phase-33/screenshots/automation-blank-capture.png`.

## Required captures (all pending manual)

| File | Screen | Status | Notes |
|------|--------|--------|-------|
| `01-first-run-guidance.png` | First-run guidance panel | **Manual required** | Open app after fresh localStorage or dismiss reset |
| `02-upload-two-tracks.png` | Upload with Track A + Track B | **Manual required** | Use `qa/full-local-workflow/phase-32/test-audio/` WAVs |
| `03-local-engine-status.png` | Local Engine Status | **Manual required** | Should show FFmpeg, Rubber Band, Demucs, PyTorch, librosa 0.11.0 |
| `04-workflow-checklist.png` | Sidebar session checklist | **Manual required** | |
| `05-analysis-screen.png` | Analysis / timeline | **Manual required** | BPM/key after librosa install + sidecar restart |
| `06-stems-screen.png` | Stem separation panel | **Manual required** | User-initiated stem preview |
| `07-combined-preview.png` | Combined preview panel | **Manual required** | After both stem previews |
| `08-export-screen.png` | Export prep panel | **Manual required** | |
| `09-artifact-browser.png` | Artifact browser | **Manual required** | |
| `10-package-result.png` | Package/export result | **Manual required** | If package step completed |

## Automation attempts (Phase 34 continuation)

| When | Tool | Target | Result |
|------|------|--------|--------|
| Phase 33 | Cursor IDE browser MCP / CDP | http://127.0.0.1:5173/ | Empty React DOM / black frame |
| 2026-06-30 | Cursor IDE browser MCP `browser_navigate` | http://127.0.0.1:5173/ | `chrome-error://chromewebdata/` — MCP browser cannot reach local Vite |
| 2026-06-30 | Cursor IDE browser MCP `browser_navigate` | http://127.0.0.1:47831/health | JSON health response — no renderable UI (expected) |

## Alternative validation evidence (substitutes API/UI automation)

- **Full workflow API chain:** `qa/full-local-workflow/phase-32/logs/` + `docs/PHASE_32_FULL_LOCAL_QA.md`
- **Librosa lane:** `qa/full-local-workflow/phase-34/logs/validation-summary.json`, `validate-analysis-lane-rerun.txt`
- **Capabilities with librosa:** `qa/full-local-workflow/phase-34/logs/capabilities-after-librosa.json`
- **Windows demo start:** `qa/full-local-workflow/phase-34/logs/start-local-windows-smoke.txt`

## How to capture (operator)

```powershell
npm run start:local:windows
# Open http://127.0.0.1:5173/ in Chrome/Edge (not Cursor embedded browser)
# Walk the session checklist; save PNGs with exact filenames above into this folder
```

After captures exist, update `docs/PHASE_34_RELEASE_DOCUMENTATION.md` screenshot table from "Manual required" to "Captured".
