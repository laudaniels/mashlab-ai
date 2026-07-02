# MVP Release Candidate Checklist

## Phase 42 — Remix Brain (RC5 gate)

- [x] Remix Brain orchestrator (`remix_brain.py`)
- [x] Anchor-based `build_mashup` (not file-start overlay)
- [x] Post-render validation + confidence tier in job params
- [x] `GET /api/plan` preview endpoint
- [x] Quick Mix UI with plan/confidence/warnings card
- [x] Advanced alignment collapsed (manual nudge)
- [x] Commercial names redacted from committed code/docs
- [x] No committed audio artifacts
- [x] Python unit tests (phrase, remix_brain, validate, beatgrid, smoke)
- [x] `npm run smoke:quick-mix:remix-brain` script
- [x] Local operator QA anchor offset < 70 ms on Track A × Track B (RC5 gate run)
- [x] `npm run check:python-service:test` passes with backend up

## Pre-tag verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-engine
npm run setup:windows:check
npm run setup:windows:check:strict
npm run check:python-service
npm run smoke:quick-mix
npm run smoke:quick-mix:browser
npm run smoke:quick-mix:remix-brain
```

## Not in v1

- RC5 git tag (manual after review)
- Cloud / sharing / downloader
- Hook Remix / DJ Edit modes
- Full section picker UI

## Ready for RC5?

Requires all verification commands pass and redaction audit clean.
