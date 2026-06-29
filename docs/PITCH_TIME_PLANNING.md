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
| Source / target BPM | Vocal track vs instrumental anchor |
| BPM difference | Absolute gap |
| Tempo stretch ratio | `targetBpm / sourceBpm` |
| Tempo stretch percent | Percent change for vocal track |
| Tempo direction | `speed_up`, `slow_down`, `none`, or `unknown` |
| Key / Camelot | Effective values with source labels |
| Suggested pitch shift | Semitones for vocal alignment (planning) |
| Safe range warning | When shift exceeds comfort thresholds |
| Formant preservation note | Recommend Rubber Band formant mode for vocals |
| Vocal vs instrumental notes | Which track would be adjusted vs anchored |

## Mash Intent Selector

Users choose a planning assumption (stem separation is **not** implemented):

| Intent | Meaning |
|--------|---------|
| Vocal A over Beat B | Track A treated as vocal source, Track B as bed |
| Vocal B over Beat A | Track B vocal over Track A bed |
| Compare both directions | Shows both strategies side-by-side |

Preview processing applies pitch/time to the **vocal/source track only** for the selected direction. True vocal/instrumental stems require a future Demucs/stem phase.

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

Override summaries and mash intent are stored in **sessionStorage** (local-only). Raw audio is never persisted. Re-uploading the same file restores overrides when file identity matches.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.
