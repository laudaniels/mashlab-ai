# Combined Preview — Phase 11

Phase 11 is the **first vocal-over-instrumental preview** in MashLab AI / CyphaBlend AI. It mixes processed vocal stems with target instrumental (`no_vocals`) stems using local Rubber Band and FFmpeg — still preview-only.

## What This Phase Does

1. Requires existing **stem preview artifacts** from Phase 10:
   - Source track: `vocals.wav`
   - Target track: `no_vocals.wav`
2. Applies **Rubber Band** pitch/time adjustment to the vocal stem from the pitch/time plan.
3. Uses **FFmpeg** to trim, align (optional offset), and mix vocal + bed.
4. Stores output at `.work/artifacts/combined-preview/{uuid}/preview.wav`.
5. Returns `audio_processed: true` and **`final_export: false`**.

## Mash Intents Supported

| Intent | Vocal source | Instrumental source |
|--------|--------------|---------------------|
| Vocal A over Beat B | Track A `vocals.wav` | Track B `no_vocals.wav` |
| Vocal B over Beat A | Track B `vocals.wav` | Track A `no_vocals.wav` |

If stem previews are missing for either track, the API returns:

> Create stem previews for both tracks first.

## What This Is Not

- Not a final mashup or mastered export
- Not studio-quality stem separation (Demucs preview only)
- Not automatic — user clicks **Create combined preview**
- No public sharing, downloader, or distribution rights granted
- No mastering or final arrangement intelligence

## Prerequisites

1. Run stem preview separation for **both** tracks (Stem separation screen).
2. Local sidecar online with **Rubber Band** and **FFmpeg** available.
3. BPM/key planning data **or** explicit **neutral processing** toggle when values are unknown.

## Sidecar Endpoint

### `POST /v1/process/combined-preview`

JSON body:

| Field | Description |
|-------|-------------|
| `mash_intent` | `vocal_a_over_beat_b` or `vocal_b_over_beat_a` |
| `source_vocal_artifact_id` | Stem preview id for vocal track |
| `target_instrumental_artifact_id` | Stem preview id for bed track |
| `tempo_ratio` | Optional planning ratio |
| `source_bpm` / `target_bpm` | Optional BPM pair |
| `pitch_shift_semitones` | Vocal pitch shift |
| `alignment_offset_ms` | Timeline alignment offset |
| `max_preview_seconds` | Default 30 (max 60) |
| `neutral_processing` | Force 1.0 ratio / 0 semitones when BPM/key missing |

**Success:** `status: preview_complete`, `final_export: false`, `artifact_url`

**Failures:**

| Status | Meaning |
|--------|---------|
| `missing_artifact` | Stem preview WAVs not found |
| `missing_dependency` | Rubber Band or FFmpeg missing |
| `validation_error` | Invalid params or unknown pitch/time without neutral flag |
| `processing_failed` | Trim, Rubber Band, or mix subprocess failed |

### Playback

`GET /v1/artifacts/combined-preview/{artifact_id}/preview`

## Artifact Paths

```text
.work/artifacts/stems/{trackStemId}/vocals.wav       # input (Phase 10)
.work/artifacts/stems/{trackStemId}/no_vocals.wav   # input (Phase 10)
.work/artifacts/combined-preview/{uuid}/preview.wav # output (Phase 11)
```

Temp files under `.work/temp/` are deleted after processing.

## Frontend

The **Combined Preview** panel lives on the **Timeline / Arrangement preview** screen. It shows:

- Mash intent and stem readiness
- Pitch/time plan values (or neutral mode)
- Safe-range warnings
- **Create combined preview** button (user-initiated only)
- Single audio player for the mixed preview WAV

## Preview Duration (Phase 12)

Combined preview duration is user-selectable:

- **15 seconds** — quick check
- **30 seconds** — default
- **60 seconds** — longer listen; shows processing cost warning
- **Custom** — up to server max (60s); validated client and server side

Stem preview max duration remains separate (180s cap for Demucs lane).

Generated artifacts appear in the **Preview artifact browser** with cleanup and technical readout.

## Privacy and Rights

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Related Docs

- `docs/PREVIEW_SESSION_MANAGEMENT.md`
- `docs/STEM_SEPARATION.md`
- `docs/RUBBER_BAND_PROCESSING.md`
