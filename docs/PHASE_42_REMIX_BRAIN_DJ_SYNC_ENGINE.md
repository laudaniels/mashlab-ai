# Phase 42: Remix Brain / DJ Sync Engine (RC4 integration)

## Summary

Phase 42 integrates the Remix Brain orchestrator onto the RC4 MashLab stack (Vite UI + local-engine sidecar). Quick Mix now plans anchor-based alignment before full-length export.

1. Analyzes vocal + beat stem artifacts (BPM, downbeats, phrases, key/Camelot, energy)
2. Generates 10–30 anchor-based remix plans
3. Scores each plan (0–100) and picks the best
4. Applies tempo ratio, vocal-only pitch shift, and alignment offset to full WAV export
5. Surfaces plan/confidence/warnings on the Quick Mix result card

## Architecture (RC4)

| Module | Role |
|--------|------|
| `local-engine/service/remix_brain/planner.py` | Plan generation, scoring, selection |
| `local-engine/service/remix_brain/phrase.py` | Phrase starts, energy curves |
| `local-engine/service/remix_brain/harmonic.py` | Camelot compatibility scoring |
| `local-engine/service/remix_brain/validate.py` | Post-render anchor offset helpers |
| `local-engine/service/remix_brain_processing.py` | Stem-artifact plan bridge |
| `POST /v1/plan/remix-brain` | Plan from stem artifact IDs |
| `src/lib/quickMix/runQuickMix.ts` | Quick Mix calls plan before export |
| `src/components/quickMix/QuickMixOutputPanel.tsx` | Plan/confidence card |

## Preserved from RC4

- Section picker (`QuickMixSectionPicker`)
- First 3:00 default window
- Custom source windows via sidecar prep
- WAV primary + optional MP3 reference
- Local-only rights-neutral scope
- Advanced Studio path unchanged

## QA

```bash
# Optional local stems (never commit audio)
set DJ_REMIX_QA_VOCAL=path\to\TrackA\vocals.wav
set DJ_REMIX_QA_BEAT=path\to\TrackB\no_vocals.wav
npm run smoke:quick-mix:remix-brain
```

Report: `qa/full-local-workflow/phase-42/remix-brain-qa-report.json` (redacted labels).

## Scope

- Local-only audio processing
- User supplies audio and is responsible for rights
- No downloader, streaming imports, cloud upload, or public sharing
