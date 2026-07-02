# Phase 43: Arrangement Brain (RC6 extension)

## Summary

Phase 43 adds DJ-style arrangement intelligence on top of Remix Brain (RC6) without changing the Quick Mix upload flow or removing the RC4 section picker.

**User flow (unchanged structure):**

Vocal source → Instrumental source → optional section → **Style** → Mix → WAV/MP3

**Style selector (default: Clean Blend):**

| Style | Behavior |
|-------|----------|
| **Clean Blend** | RC6 Remix Brain — best plan, anchor-aligned vocal over instrumental, one phrase-aligned mix |
| **Hook Remix** | Highest vocal-density hook phrase + compatible instrumental bed, 16/32-bar hook section |
| **DJ Edit** | 8-bar intro → 16-bar vocal → optional 8-bar break → 16-bar vocal return → 8-bar outro (bar/phrase cuts only) |

## ArrangementPlan model

`local-engine/service/arrangement_brain/models.py`

- `mode`, `target_bpm`, `sections[]`, warnings, confidence score (0–100)
- Each section: label (`intro` / `hook` / `break` / `outro` / `mix`), source (`vocal` / `instrumental` / `mix`), start/duration seconds, bar counts, fade in/out, ducking, per-section gain

**Confidence tiers:** 80+ high · 65–79 medium · below 65 low (with warning)

## Architecture

| Module | Role |
|--------|------|
| `arrangement_brain/planner.py` | Clean Blend, Hook Remix, DJ Edit planners |
| `arrangement_brain/scoring.py` | 0–100 scoring (phrase alignment, vocal density, energy, harmonic, tempo, section fit, render safety) |
| `arrangement_brain_processing.py` | Plan API bridge — Remix Brain `pick_best_plan` then arrangement planner |
| `arrangement_export_processing.py` | Multi-section render + concat; Clean Blend delegates to full WAV export |
| `POST /v1/plan/arrangement-brain` | Plan from stem artifact IDs + `arrangement_mode` |
| `POST /v1/export/arrangement-wav` | Render arrangement plan to WAV |
| `src/domain/arrangementBrain.ts` | Types, style options, output card builder |
| `src/components/quickMix/QuickMixStylePicker.tsx` | Style radio group |
| `src/lib/quickMix/runQuickMix.ts` | Calls arrangement plan + export |

## Preserved

- RC4 section picker + 180-second cap
- RC6 Remix Brain analysis and plan selection (Clean Blend path)
- Local-only scope — no cloud upload, downloader, streaming imports, or public sharing
- Advanced Studio unchanged

## QA

```powershell
# Optional local stems (never commit audio or commercial filenames)
$env:DJ_REMIX_QA_VOCAL = "path\to\TrackA\vocals.wav"
$env:DJ_REMIX_QA_BEAT  = "path\to\TrackB\no_vocals.wav"
npm run smoke:quick-mix:arrangement-brain
```

Report: `qa/full-local-workflow/phase-43/arrangement-brain-operator-qa-report.json` (redacted labels).

Browser smoke: `npm run smoke:quick-mix:browser` records `failedRequests` and ignores harmless `/favicon.ico` 404s (browsers request it even with inline SVG favicon; `public/favicon.ico` is served in dev/build).

Interactive operator browser QA (all three styles, real audio): `npm run smoke:quick-mix:arrangement-browser` with `MASHLAB_QM_VOCAL` + `MASHLAB_QM_BEAT`.

Browsers may still request `/favicon.ico` even when `index.html` uses an inline SVG icon. A minimal `public/favicon.ico` is served to avoid dev-console 404 noise; browser smoke ignores any residual favicon 404 as harmless.

- No producer effects, fake drops, or random cuts
- Hook/DJ Edit arrangements are heuristic — low confidence surfaces warnings, not “mastered” claims
- 180-second cap per source window (same as RC4/RC6)
- MP3 remains optional reference; WAV is primary

## Baseline

- Canonical tag: `mashlab-remix-brain-integrated-rc6` @ `6430f89`
- **Do not tag RC7 until explicitly approved**
