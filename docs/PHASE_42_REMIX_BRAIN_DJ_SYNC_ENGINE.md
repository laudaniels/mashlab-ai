# Phase 42: Remix Brain / DJ Sync Engine

## Summary

Phase 42 replaces blind file-overlay placement with a **Remix Brain** orchestrator that:

1. Analyzes vocal + beat sources (BPM, downbeats, phrases, key/Camelot, energy)
2. Generates 10–30 anchor-based remix plans
3. Scores each plan (0–100)
4. Renders the best plan with Rubber Band stretch + vocal-only pitch shift
5. Validates post-render anchor sync and surfaces confidence/warnings in the UI

## Architecture

| Module | Role |
|--------|------|
| `backend/app/audio/remix_brain.py` | Plan generation, scoring, selection |
| `backend/app/audio/phrase.py` | Phrase starts, energy/vocal density curves |
| `backend/app/audio/harmonic.py` | Camelot compatibility scoring |
| `backend/app/audio/validate.py` | Post-render anchor offset measurement |
| `backend/app/audio/pipeline.py` | Anchor render path via `build_mashup` |
| `GET /api/plan` | Plan preview without rendering |

## Scoring (100 points)

| Component | Max |
|-----------|-----|
| Tempo safety | 20 |
| Beat confidence | 15 |
| Downbeat confidence | 15 |
| Phrase alignment | 20 |
| Harmonic compatibility | 15 |
| Vocal/bed space | 10 |
| Render safety | 5 |

### Confidence tiers

- **High** — plan score ≥ 80
- **Medium** — 65–79
- **Low** — < 65

Render always proceeds with the highest-scoring plan; warnings remain visible.

## Validation thresholds

| Anchor offset | Meaning |
|---------------|---------|
| < 40 ms | Ideal |
| < 70 ms | Acceptable |
| < 120 ms | Warning |
| ≥ 120 ms | Fail flag (still completes with warning) |

| Tempo stretch | Meaning |
|---------------|---------|
| ≤ 3% | Safe |
| 3–6% | Acceptable |
| 6–8% | Warning |
| > 8% | Avoid unless half/double-time rescue applies |

## RC4 → Phase 42

RC4 used time-based section windows only. Phase 42 adds DJ-theory planning: tempo, beat, downbeat, phrase, key, energy, and vocal-space logic before placement.

## Local QA (redacted)

Operator QA on this machine used **Track A (vocal) × Track B (beat)** only:

| Case | Stretch | Anchor offset | Tier |
|------|---------|---------------|------|
| default | ~−0.6% | ~−5 ms | medium |
| +4 bars | ~−0.6% | ~−6 ms | medium |
| manual nudge | ~−0.6% | ~−11 ms | medium |

Logs and reports use redacted labels only. No commercial filenames or audio are committed.

## Limitations (v1)

- Hook Remix / DJ Edit modes deferred
- BeatNet/madmom/Essentia adapters are stubs
- Section picker is API-level (time windows); UI section controls are advanced
- No cloud, sharing, downloader, or publishing-rights features
- In-memory storage — tracks lost on backend restart

## Commands

```bash
npm run smoke:quick-mix:remix-brain   # local real-audio QA (redacted)
npm test                              # python unit tests
```
