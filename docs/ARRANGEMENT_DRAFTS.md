# Arrangement Draft Intelligence (Phase 20–21)

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

## Section Selection and Preview Binding (Phase 21)

Phase 21 makes arrangement plans **operational inside the existing user-initiated workflow**:

1. **Select an advisory section** from the section timeline (Clean Blend / Club Edit / Creative Blend).
2. Click **Apply section to preview settings** — configures combined preview duration, optional start offset, mash intent, and mix settings.
3. Combined Preview panel shows the bound section and whether start offset will be applied.
4. User **must still click Create combined preview** — no auto-processing.

### Selected section stores

- Draft type, section id/label
- Start time (when available), duration bars/seconds
- Phrase basis and source label (heuristic / DJ override / unavailable)
- Limitations (advisory only — not detected song structure)

### Start offset behavior

| Condition | UI / sidecar behavior |
|-----------|----------------------|
| Start time available (> 0s) | `preview_start_seconds` sent to sidecar FFmpeg trim |
| Start unavailable | Duration + intent/mix apply only; UI shows pending notice |
| Start at 0s | Preview begins at source artifact start |

Notice when offset unavailable:

> Section start is planned but current preview begins at the source artifact start.

### Missing requirement deep links

The Arrangement Plan panel lists actionable missing requirements with **Go to required step** buttons:

- Upload tracks → Upload screen
- Run analysis → Analysis screen
- DJ overrides / pitch-time plan → Timeline
- Stem previews → Stems screen
- Sidecar / FFmpeg / Rubber Band / Demucs hints → Analysis or Stems

### Session persistence

- `mashlab-arrangement-section-v1` — selected section metadata
- `mashlab-arrangement-section-binding-v1` — preview binding (no raw audio)
- `mashlab-arrangement-section-context-v1` — full traceability snapshot at bind time (Phase 22)

### Workflow checklist

Session checklist tracks:

- Arrangement draft plan selected / applied
- Section bound to preview settings
- Stale binding warning when session state diverges (Phase 22)
- Combined preview still requires explicit user action

## Section Context Traceability (Phase 22)

When you **Apply section to preview settings**, the app saves an `ArrangementSectionContext` snapshot:

- Draft type, section id/label, phrase basis, source label
- Preview start offset status, duration, mash intent and mix settings at bind time
- Pitch/time plan snapshot when available
- `planningOnly: true`, `djReviewRequired: true`
- Rights and traceability notices

This context is carried through (when present and not unavailable):

- Combined preview request + `preview.meta.json`
- Preview-length WAV export (inherits from preview or request)
- Full-length WAV export (**metadata only** — does not trim to section)
- MP3 export, mastering preset output, project package manifest + technical report
- Preview Artifact Browser summaries

### Stale binding detection

The app compares the saved binding snapshot to current session state:

| Change | Severity |
|--------|----------|
| Mash intent, draft type, selected section, stem artifact refs | **Stale** |
| Mix settings, DJ overrides, pitch/time plan | **Partially stale** |

Statuses: `current`, `stale`, `partially_stale`, `unavailable`.

Warnings are shown on Drafts, Combined Preview, Export, and the session checklist. The user can **re-apply** section settings or continue manually — exports are not blocked.

### Advisory notices

- Arrangement sections are advisory and do not grant rights.
- No true verse/chorus/drop detection.
- Full-length export: *Arrangement context only — full-length render. Section-only export is not implemented.*

No public sharing, cloud upload, downloader, or streaming integrations.

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

## Phase 23: Section Window Export Handoff

After binding a section (Phase 21) and traceability (Phase 22), users can export the **advisory planning window** from stem artifacts on the Export screen:

- Requires section binding + duration
- Context diff guard compares bound vs current session before export
- Stale context requires explicit confirmation
- Not detected song structure — see `docs/SECTION_EXPORTS.md`

## Phase 24: Phrase Evidence Upgrade

Arrangement drafts now prefer stronger phrase evidence when available:

1. DJ override
2. Verified phrase markers
3. Verified downbeats
4. Heuristic phrase markers / heuristic from beats
5. Unavailable

Run **Phrase Analysis** on the Timeline screen to populate evidence. See `docs/PHRASE_DOWNBEAT_ANALYSIS.md`.

## Phase 25: Rhythm Engine Adapters

When madmom is installed (Linux/WSL), verified downbeat/phrase evidence flows into drafts automatically. Essentia provides beat extraction with heuristic phrase windows only — never labeled verified. Export/package metadata inherits `phrase_evidence_method` and `phrase_basis` from arrangement context.

Optional install: `local-engine/service/requirements-rhythm.txt`

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
- `docs/SECTION_EXPORTS.md` — section window export (Phase 23)
- `docs/QA_WORKFLOW_CHECKLIST.md` — manual verification
- `docs/LEGAL_DOCTRINE.md` — rights doctrine
