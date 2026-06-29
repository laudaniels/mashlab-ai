# Pitch / Time Planning — Phase 8

Phase 8 adds **planning-only** pitch and tempo strategy tooling. MashLab can explain what would need to happen technically before any audio is transformed.

## Planning Only

- No audio is processed, pitch-shifted, or time-stretched in this phase.
- No Rubber Band subprocess is invoked.
- No export or rendered preview is produced.
- All UI copy states: **Planning only — no audio has been processed yet.**

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

This is a **planning assumption only**. True vocal/instrumental stems require a future Demucs/stem phase.

## Rubber Band Readiness

The local sidecar reports Rubber Band CLI status via `/v1/capabilities`:

| Status | Meaning |
|--------|---------|
| `available` | `rubberband`, `rubberband-cli`, or Windows executable found on PATH |
| `missing` | Not installed — planning still works in browser |
| `planned` | Legacy label if capability not yet probed |

Rubber Band is the **preferred future engine** for high-quality pitch/time processing. SoundTouch remains a possible lightweight fallback later.

### Setup guidance (when missing)

Install [Rubber Band CLI](https://breakfastquay.com/rubberband/) and ensure `rubberband` or `rubberband-cli` is on PATH. MashLab remains fully usable for planning without it.

## Optional Sidecar Endpoint

`POST /v1/plan/pitch-time` accepts JSON track summaries (BPM, key, Camelot) and returns a planning-only result. **No raw audio** is accepted.

Primary planning runs in the frontend for stability; the endpoint mirrors the same logic for validation and future tooling.

## Formant Preservation

When a non-zero vocal pitch shift is suggested, the plan recommends **Rubber Band formant preservation** to reduce chipmunk/boomy artifacts. This is advisory only until processing is implemented.

## Missing BPM / Key Data

- Missing BPM → tempo ratio/direction `unknown`; tempo plan explains what is needed.
- Missing key/Camelot → pitch shift `null`; key plan says no safe shift recommended.
- DJ overrides fill gaps when the user supplies values manually.

## Session Persistence

Override summaries and mash intent are stored in **sessionStorage** (local-only). Raw audio is never persisted. Re-uploading the same file restores overrides when file identity matches.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.
