# Phase 34/35 UI screenshot evidence manifest

**Updated:** Phase 35 release packaging (2026-06-30)  
**Capture method:** Playwright + Microsoft Edge (`npm run capture:release-screenshots`)  
**Prerequisite:** Vite on http://127.0.0.1:5173/ + sidecar healthy at http://127.0.0.1:47831

Upload audio you own or are authorized to use. Screenshots use synthetic FFmpeg lavfi test WAVs only.

## Summary

| Category | Status |
|----------|--------|
| Automated capture (Playwright + Edge) | **Complete** — 10 PNGs |
| API / librosa validation | **Complete** — phase-32/34 logs |
| `start:local:windows` smoke | **Complete** — phase-34 logs |

**Note:** Phase 34 blocked on Cursor IDE browser MCP (could not reach local Vite). Phase 35 fixed a circular import (`COMBINED_PREVIEW_DEFAULT_SECONDS`) that prevented React from mounting in automated browsers, then captured via Playwright + Edge.

## Required captures

| File | Screen | Status | Notes |
|------|--------|--------|-------|
| `01-first-run-guidance.png` | First-run guidance panel | **Captured** | sessionStorage dismiss cleared before capture |
| `02-upload-two-tracks.png` | Upload with Track A + Track B | **Captured** | Synthetic test WAVs from phase-32/test-audio |
| `03-local-engine-status.png` | Local Engine Status | **Captured** | Sidebar panel — FFmpeg, Rubber Band, Demucs, librosa |
| `04-workflow-checklist.png` | Session workflow checklist | **Captured** | WorkflowReadinessPanel |
| `05-analysis-screen.png` | Analysis / timeline | **Captured** | Both tracks loaded |
| `06-stems-screen.png` | Stem separation panel | **Captured** | |
| `07-combined-preview.png` | Timeline / combined preview | **Captured** | |
| `08-export-screen.png` | Export prep panel | **Captured** | |
| `09-artifact-browser.png` | Artifact browser | **Captured** | Registry hydrated from `/v1/artifacts` |
| `10-package-result.png` | Package / export result | **Captured** | After phase-32 API QA package step |

## Automation history

| When | Tool | Result |
|------|------|--------|
| Phase 33–34 | Cursor IDE browser MCP | Empty DOM / chrome-error |
| Phase 35 | Playwright headless Edge | **Blocked** until circular import fix |
| Phase 35 | Playwright + Edge after fix | **10/10 PNGs** |

## Manual fallback (operators)

If automated capture fails, use Chrome or Edge manually after `npm run start:local:windows`. Do not commit blank or fabricated screenshots.

## Alternative API evidence

- `qa/full-local-workflow/phase-32/logs/` — full workflow API QA
- `qa/full-local-workflow/phase-34/logs/` — librosa validation
