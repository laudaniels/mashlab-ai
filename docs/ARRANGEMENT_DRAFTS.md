# Arrangement Draft Intelligence (Phase 20)

Phase 20 adds the **first arrangement intelligence layer** in MashLab AI / CyphaBlend AI. It helps DJs plan draft mash structures using honest templates — **planning only**, with no auto-processing and no claims of true song-section detection.

## What This Phase Does

1. Defines a typed **arrangement plan** model (`src/domain/arrangementPlanning.ts`).
2. Provides three **draft templates**:
   - **Clean Blend** — shortest/safest structure, minimal tempo/pitch suggestions, preview-length export bias.
   - **Club Edit** — intro/outro planning with 8/16/32-bar **heuristic** phrases where beat data exists; longer preview/export duration.
   - **Creative Blend** — more aggressive pitch/time suggestions (with warnings), advisory hook-over-drop language, stronger DJ review emphasis.
3. Shows an **Arrangement Plan** panel on Drafts, Timeline, and Export screens.
4. Optional **Apply draft settings** handoff to mash intent, mix settings, preview duration, and export mode hints — user must still click **Create combined preview** or **Export**.

## What This Is Not

- Not AI arrangement with confidence scores
- Not verse/chorus/drop detection unless a future engine provides verified data
- Not downbeat detection — downbeat status remains `not_implemented` in beat analysis
- Not auto-processing — nothing runs until the user clicks preview or export
- No public sharing, cloud upload, downloader, or streaming integrations
- No distribution or publishing rights granted

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Draft Templates

| Template | ID | Preview seconds | Export bias | Character |
|----------|-----|-----------------|-------------|-----------|
| Clean Blend | `clean_blend` | 30 (default) | Preview copy | Conservative mix, low risk |
| Club Edit | `club_edit` | 60 (max) | Full length | Intro/outro blocks, DJ utility |
| Creative Blend | `creative_blend` | 45 | Either | Experimental pitch/time, advisory hooks |

All templates set `planningOnly: true` on generated plans.

## Phrase Basis (Honest Labels)

Plans record how section timing was derived:

| Basis | Meaning |
|-------|---------|
| `detected_beats` | Beat times exist; no verified downbeats |
| `heuristic_phrase_markers` | 8/16/32-bar heuristic windows from beat grid |
| `dj_override` | User set phrase length or alignment offset |
| `unavailable` | No beat grid — sections are advisory placeholders only |

Section labels are **planning blocks** (e.g. "Intro (heuristic 16 bars)") — not detected song structure.

## Arrangement Plan Model

Key fields:

- `draftType`, `mashIntent`, source/target track labels
- `requiredArtifacts`, `missingRequirements`, `readinessReady`
- `tempoPlanSummary`, `keyPitchPlanSummary`
- `phraseBasis`, `phraseBasisDetail`
- `arrangementSections[]` — advisory only (`advisoryOnly: true`)
- `mixSettingsReference`, `suggestedPreviewSeconds`, `suggestedExportMode`
- `warnings`, `limitations`, `djReviewRequired: true`, `planningOnly: true`
- `rightsNotice`

## Apply Draft Settings

When readiness is satisfied, **Apply draft settings**:

1. Saves mash intent, preview duration, mix settings, and export mode hint to `localStorage`.
2. Combined Preview panel loads applied preview duration and mix settings on next visit.
3. Export panel shows a notice when full-length or preview-copy export is suggested.

The user **must still** click:

- **Create combined preview** (Combined Preview screen), or
- **Export** buttons (Export screen)

No audio is processed by applying a draft.

## UI Surfaces

- **Drafts** — template picker and full plan summary
- **Timeline** — plan alongside alignment context
- **Export** — plan plus export mode hints

Notice shown on panel:

> Plan only — no audio is processed until you click preview or export.

## Integration With Existing Workflow

Plans consume:

- Session artifacts (both tracks loaded)
- Stem preview readiness
- Beat grid / heuristic phrases / DJ overrides
- Pitch/time plan summaries
- Mix settings reference
- Combined preview and export readiness gates

Missing data is listed in `missingRequirements` — never fabricated.

## Backend

Arrangement planning is **frontend-only** in Phase 20. No sidecar endpoint accepts raw audio for arrangement. A future endpoint could accept **summaries only** and return planning-only JSON.

## Tests

`scripts/verify-core.mts` — `Arrangement draft intelligence` describe block:

- Clean/club/creative template behavior
- Missing phrase data → `unavailable`
- No fake verse/chorus/drop labels
- `applyDraftSettingsFromPlan` does not enable auto-processing
- `planningOnly: true`, rights notice presence

## Related Docs

- `docs/BEAT_GRID_AND_HARMONIC_PLANNING.md` — heuristic phrases
- `docs/PITCH_TIME_PLANNING.md` — tempo/key summaries
- `docs/COMBINED_PREVIEW.md` — preview handoff after apply
- `docs/LOCAL_EXPORTS.md` — export mode hints
- `docs/QA_WORKFLOW_CHECKLIST.md` — manual verification
- `docs/LEGAL_DOCTRINE.md` — rights doctrine
