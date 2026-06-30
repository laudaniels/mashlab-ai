# Phase 37 Quick Mix MVP RC evidence manifest

**Tag target:** `mashlab-quick-mix-mvp-rc1`  
**Base commit:** `1d6bb44` — Improve sidecar lifecycle and Quick Mix smoke validation  
**RC checkpoint commit:** tagged at final HEAD after preflight smokes  
**Updated:** 2026-06-30

Upload audio you own or are authorized to use. All smoke inputs are synthetic FFmpeg lavfi WAVs only — no commercial music.

## Default MVP flow

Drop vocal source → drop instrumental source → click **Mix** → local WAV export (+ optional MP3 reference).

## Automated evidence

| File | Purpose | Status |
|------|---------|--------|
| `quick-mix-smoke-log.json` | API orchestration smoke (stems → WAV → optional MP3) | **Committed** |
| `quick-mix-browser-smoke-log.json` | Playwright browser Quick Mix validation | **Committed** |
| `quick-mix-browser-smoke.png` | Browser smoke screenshot (Quick Mix output) | **Committed** |

## Smoke artifact IDs (Phase 37 session)

| Export | Artifact ID |
|--------|-------------|
| WAV | `bdf7af3d2bfd440fb568da98f06fe956` |
| MP3 (optional) | `5530abac833443ac8092a8201ef649d2` |

Re-run `npm run smoke:quick-mix` to regenerate IDs on a fresh sidecar session.

## Commands

```powershell
npm run sidecar:status
npm run smoke:quick-mix
npm run smoke:quick-mix:browser   # requires npm run dev
```
