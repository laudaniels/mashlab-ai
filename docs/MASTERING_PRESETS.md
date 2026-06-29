# Mastering Presets (Phase 16)

MashLab AI / CyphaBlend AI supports **local mastering preset prototypes** from existing WAV export artifacts. All mastering is explicit, user-initiated, and rights-neutral.

## Source Requirement

Mastering **must** use an existing local **WAV export** artifact (`export.wav`). It does **not** process:

- Raw uploads
- Stem artifacts directly
- MP3 export artifacts
- Combined preview artifacts directly

## Presets

| Preset ID | Label | Behavior |
|-----------|-------|----------|
| `measurement_only` | Measurement only | Before/after readout (after = before); **no master audio written** |
| `general_safe_normalize` | General safe reference | FFmpeg loudnorm ~ **-14 LUFS** / **-1 dBTP** — general playback reference prototype |
| `dj_loudness_prototype` | DJ loudness prototype | FFmpeg loudnorm ~ **-9.5 LUFS** / **-1 dBTP** — louder prototype; DJ review required |
| `club_loudness_prototype` | Club loudness prototype | FFmpeg loudnorm ~ **-8 LUFS** / **-1 dBTP** — prototype only; **not club-ready certification** |

## Endpoint

### `POST /v1/master/wav`

Request:

```json
{
  "source_wav_export_artifact_id": "abc123",
  "preset": "general_safe_normalize",
  "export_label": "Optional label"
}
```

Response highlights:

- `master_artifact_id`
- `source_wav_export_artifact_id`
- `preset`
- `before_readout` / `after_readout` (technical + loudness)
- `target_integrated_lufs` / `target_true_peak_dbtp`
- `loudness_gate` (`pass` / `warn` / `not_available`)
- `audio_created` (false for measurement-only)
- `artifact_url` / `download_url` when audio was created
- `finalExport: true`
- `publicShare: false`
- `masteringPrototype: true`
- `rights_notice`, `warnings`, `limitations`

Playback (when audio created):

`GET /v1/artifacts/masters/{id}/master`

## Honest Limitations

- **Not professional mastering** or a club-ready final unless measured targets pass the informational gate
- Gate pass/warn is **informational only** — not a release certification
- DJ loudness prototype may affect dynamics and increase distortion risk
- Club loudness prototype is louder still (~-8 LUFS) with higher distortion risk — gate pass does **not** mean club-ready
- Mix-stage limiter/clipping guard (Phase 18) is separate from mastering presets — see `docs/MIX_CONTROLS.md`
- No public sharing, streaming integration, or distribution rights granted

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Storage

```text
.work/artifacts/masters/{uuid}/master.wav       # when preset creates audio
.work/artifacts/masters/{uuid}/master.meta.json # preset, source id, readouts, gate
```

## Artifact Browser

Master artifacts appear as type `master` with labels like `master / general_safe_normalize`:

> Local mastering prototype — user responsible for rights. No public distribution rights granted.

Measurement-only masters list without playback URL.

## Cleanup

- `DELETE /v1/artifacts/{master_id}` removes master folder under `.work/artifacts/masters/`
- `DELETE /v1/artifacts?scope=session` clears previews, exports, **and** masters
- Nothing outside `.work/artifacts/` is deleted

## Related Docs

- `docs/EXPORT_AND_MASTERING_PLAN.md`
- `docs/LOCAL_EXPORTS.md`
- `docs/PREVIEW_SESSION_MANAGEMENT.md`
