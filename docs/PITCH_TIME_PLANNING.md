# Pitch / Time Planning — Phases 8–9

Phase 8 adds **planning-only** pitch and tempo strategy tooling. Phase 9 adds an optional **user-initiated Rubber Band preview lane** — still not a final mashup or export.

## Planning vs Preview

| Mode | Audio processed? | Trigger |
|------|------------------|---------|
| Planning (Phase 8) | No | Automatic when both tracks analyzed |
| Preview (Phase 9) | Yes — short clip only | User clicks “Create pitch/time preview” |

Planning copy: **Planning only until you create an explicit pitch/time preview.**

Preview copy: **Preview only — not a final mashup, stem separation, or export.**

See `docs/RUBBER_BAND_PROCESSING.md` for processing details.

## Pitch/Time Plan Model

The typed planner (`src/domain/pitchTimePlanning.ts`) uses effective artifact data (including DJ overrides) to describe:

| Field | Description |
|-------|-------------|
| Source BPM | Vocal track's BPM |
| Target BPM | Instrumental's BPM by default, or the custom target BPM when set (see below) |
| BPM difference | Absolute gap between the two tracks' native BPMs |
| Tempo stretch ratio | Vocal's ratio: `targetBpm / sourceBpm` |
| Tempo stretch percent | Percent change for vocal track |
| Tempo direction | `speed_up`, `slow_down`, `none`, or `unknown` |
| Instrumental tempo stretch ratio / percent / direction | Same, for the instrumental track. `1.0` / `none` by default (instrumental is the anchor); moves symmetrically with the vocal once a custom target BPM is set |
| Tempo ratio warning | Shown when either track's ratio would fall outside Rubber Band's supported 0.5–2.0x range for the current target |
| Key / Camelot | Effective values with source labels |
| Suggested pitch shift | Semitones for vocal alignment (planning) |
| Safe range warning | When shift exceeds comfort thresholds |
| Formant preservation note | Recommend Rubber Band formant mode for vocals |
| Vocal vs instrumental notes | What each track's tempo will do once processing runs |

## Custom Target BPM (optional)

By default the target tempo locks to the **instrumental's own BPM** — only the vocal is time-stretched to match it, exactly as before this feature existed.

Setting a **custom target BPM** in the Pitch/Time Plan panel changes that: both the vocal and the instrumental now stretch toward the value you enter, so the mashup can land on a tempo between (or outside) the two tracks' native BPMs. Leave the field blank to fall back to the default anchor-to-instrumental behavior — this also restores today's original behavior exactly, since the instrumental's own ratio always computes to `1.0` when no custom target is set.

Validation:

- Input is parsed the same way as the per-track BPM override (`parseBpmOverride` — rejects ≤0 or >300 BPM).
- If the resulting stretch ratio for either track would exceed Rubber Band's supported range (0.5–2.0x), the plan shows a warning naming which track(s) are affected instead of silently letting a later preview/export request fail.
- The value is session-persisted alongside the mash intent (sessionStorage, local-only).

**Known limitation:** multi-section Arrangement Brain exports (Club Edit / Creative Blend) do not support a custom target BPM — their section boundaries are anchored to the instrumental's original, unstretched timeline, so retiming the whole bed file would silently misalign every section. Requesting a custom target BPM against one of those plans returns a clear `unsupported_request` error rather than a mis-rendered export. Clean Blend arrangement exports (which just delegate to the full-length export path) and the other three processing lanes — combined preview, full-length export, and section window export — all support it fully.

Since vocal and instrumental now stretch independently, they can end up different lengths (e.g. one sped up and shorter, the other slowed down and longer). The final mix always runs to the end of the **longer** of the two (`amix duration=longest` — see `docs/MIX_CONTROLS.md`); the shorter track simply ends and the longer one continues alone. It never silently truncates the export to whichever track happens to be shorter.

## Mash Intent Selector

Users choose a planning assumption (stem separation is **not** implemented):

| Intent | Meaning |
|--------|---------|
| Vocal A over Beat B | Track A treated as vocal source, Track B as bed |
| Vocal B over Beat A | Track B vocal over Track A bed |
| Compare both directions | Shows both strategies side-by-side |

By default, preview and export processing applies pitch/time to the **vocal/source track only** for the selected direction, with the instrumental kept at its native tempo as the anchor. When a custom target BPM is set, both tracks are processed instead. True vocal/instrumental stems still require Demucs stem separation (Phase 10+) — this planner treats whichever role is selected as a full-track approximation.

## Rubber Band Readiness

The local sidecar reports Rubber Band CLI status via `/v1/capabilities`:

| Status | Meaning |
|--------|---------|
| `available` | `rubberband`, `rubberband-cli`, or Windows executable found on PATH |
| `missing` | Not installed — planning still works; preview disabled |
| `planned` | Legacy label if capability not yet probed |

Rubber Band is the **preferred engine** for high-quality pitch/time preview processing.

### Setup guidance (when missing)

Install [Rubber Band CLI](https://breakfastquay.com/rubberband/) and ensure `rubberband` or `rubberband-cli` is on PATH. MashLab remains fully usable for planning without it.

## Sidecar Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/plan/pitch-time` | Planning-only JSON summaries (no audio) |
| `POST /v1/process/pitch-time-preview` | Short Rubber Band preview clip from uploaded audio |
| `GET /v1/artifacts/pitch-time-preview/{id}` | Local playback/download of preview WAV |

Primary planning runs in the frontend for stability; the planning endpoint mirrors the same logic for validation and future tooling.

## Formant Preservation

When a non-zero vocal pitch shift is suggested or applied, the plan and preview recommend **Rubber Band formant preservation** (`-F`) to reduce chipmunk/boomy artifacts.

## Missing BPM / Key Data

- Missing BPM → tempo ratio/direction `unknown`; tempo plan explains what is needed.
- Missing key/Camelot → pitch shift `null`; key plan says no safe shift recommended.
- DJ overrides fill gaps when the user supplies values manually.

## Session Persistence

Override summaries, mash intent, and the custom target BPM are stored in **sessionStorage** (local-only). Raw audio is never persisted. Re-uploading the same file restores overrides when file identity matches.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.
