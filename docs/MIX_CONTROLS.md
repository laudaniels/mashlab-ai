# Mix Quality Controls (Phase 18)

MashLab AI / CyphaBlend AI exposes **user-controlled mix settings** before combined preview and full-length WAV export. Mix controls are local, explicit, and prototype-grade — not professional mastering.

## What You Can Adjust

| Control | Range | Notes |
|---------|-------|-------|
| Vocal level | -24 to +12 dB | Per-track gain before mix |
| Instrumental bed level | -24 to +12 dB | Per-track gain before mix |
| Master trim | -24 to +12 dB | Post-mix bus gain |
| Vocal fade in/out | 0–30 s | FFmpeg `afade` when duration known |
| Bed fade in/out | 0–30 s | FFmpeg `afade` when duration known |
| Limiter safety | on/off | Conservative FFmpeg `alimiter` prototype (0.95) |
| Clipping guard | on/off | ~-1 dBTP ceiling prototype (takes priority over limiter safety) |

Stereo/mono safety is **display-only** in this phase — verify phase compatibility manually.

## Where Mix Settings Apply

- **Combined preview** — `POST /v1/process/combined-preview`
- **Full-length WAV export** — `POST /v1/export/full-wav`

Mix settings do **not** retroactively change existing artifacts. Create a new preview or export to apply changes.

## Request Fields

All mix fields are optional; omitted values default to neutral (0 dB gain, no fades, limiter/guard off):

```json
{
  "vocal_gain_db": 0,
  "instrumental_gain_db": 0,
  "master_gain_db": 0,
  "vocal_fade_in_ms": 0,
  "vocal_fade_out_ms": 0,
  "instrumental_fade_in_ms": 0,
  "instrumental_fade_out_ms": 0,
  "limiter_safety": false,
  "clipping_guard": false
}
```

## FFmpeg Pipeline (Prototype)

1. Trim (preview only) + alignment delay per track
2. Per-track gain + fades
3. `amix` (`duration=longest`, `normalize=0`) — the mix runs to the end of whichever track is longer; the shorter track just ends and the longer one continues alone. This matters once a custom target BPM independently time-stretches both tracks (see `docs/PITCH_TIME_PLANNING.md`) — one can end up shorter than the other, and the mix should not silently truncate to it.
4. Optional master trim
5. Optional `alimiter` (clip guard or limiter safety)

## Metadata and Artifact Browser

Combined preview writes `.work/artifacts/combined-preview/{uuid}/preview.meta.json` including `mix_settings`.

Full export writes `mix_settings`, `limiter_safety_applied`, and `clipping_guard_applied` in `export.meta.json`.

Artifact listings expose a short `mix_summary` string (e.g. `vocal +1.5 dB · bed -2.0 dB · limiter on`).

Project package manifests attach mix settings when present on included combined preview or full export artifacts.

## Loudness and Clipping Warnings

After mix/master stages, the service may append informational warnings when:

- True peak exceeds safe thresholds
- True peak is near ceiling
- Loudness readout is `not_available`

These warnings require **DJ review** — they are not certification.

## Session Persistence (Frontend)

The UI stores last-used mix settings in `localStorage` (`mashlab-mix-settings-v1`) when the user clicks **Save as session preference**. Reset returns neutral defaults without clearing saved preference until overwritten.

## Honest Limitations

- Not professional mastering or a club-ready claim
- Limiter/clipping guard are FFmpeg prototypes only
- Existing artifacts are unchanged until re-rendered
- No public sharing, streaming, or distribution rights granted

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute remain the user's responsibility.
