# Export and Mastering Plan

## Current State (Phase 16)

- **Mastering preset prototypes** from WAV export artifacts (measurement-only, general safe normalize, DJ loudness prototype)
- **Full-length WAV export** re-renders from stem artifacts + session plan (Rubber Band + FFmpeg full mix)
- **Preview-length WAV export** copies existing combined preview artifact (Phase 13)
- **MP3 reference export** encodes from existing WAV export artifact only (Phase 15)
- Export panel unlocks when both stem previews exist **or** a combined preview exists
- Mastering and MP3 sections unlock when at least one WAV export exists
- Loudness gate displays pass/warn/not_available against preset targets (informational only)
- Stem package export, club mastering certification, and public sharing remain **not implemented**

Preview artifacts (stem, combined, pitch/time) remain `finalExport: false`.

## Phase 16 Mastering Presets (Implemented)

| Item | Status |
|------|--------|
| Measurement-only readout (no audio write) | Available |
| General safe normalize (~-14 LUFS / -1 dBTP) | Available when FFmpeg present |
| DJ loudness prototype (~-9.5 LUFS / -1 dBTP) | Available when FFmpeg present |
| Before/after readout + informational gate | Available when FFmpeg measures |

See `docs/MASTERING_PRESETS.md` for API and storage details.

## Phase 15 MP3 Reference Export (Implemented)

| Item | Status |
|------|--------|
| MP3 from WAV export artifact only | Available (user-initiated) |
| Bitrate 320 / 256 / 192 kbps | Available |
| Technical + loudness readout after encode | Available when FFmpeg measures |
| Export session UX (local preferences + re-export) | Available |

MP3 is **not** full mastering and does **not** grant distribution rights.

## Phase 14 Full-Length Export (Implemented)

| Item | Status |
|------|--------|
| Full-length WAV from stem artifacts + plan | Available (user-initiated) |
| Rubber Band vocal + FFmpeg full mix | Available when dependencies present |
| Loudness gate readout (informational) | Available when FFmpeg measures |
| Preview-length copy from combined preview | Available (Phase 13) |

See `docs/LOCAL_EXPORTS.md` for API and storage details.

## Recommended Next Phase

**Club version presets + export packaging UX** — still local and rights-neutral. Not public sharing or streaming integration.

## Planned Loudness Targets (Future Full Mastering)

These are **design targets** for a future mastering lane — not claims about current exports:

| Profile | Integrated loudness | True peak |
|---------|---------------------|-----------|
| General playback | ~ -14 LUFS | ~ -1 dBTP |
| Club version | TBD (planned) | TBD (planned) |

Current export loudness readout is for **review/measurement**. Optional `normalize_preview` applies FFmpeg loudnorm to the preview copy only and is explicitly labeled as a prototype — not club-ready mastering.

## Architecture Notes

1. Explicit user export action (no auto-export)
2. Phase 13 copies from combined preview; future phases may re-render full length
3. Preview lanes (Demucs, Rubber Band, FFmpeg) remain separate from export mastering
4. Loudness/true-peak validation gate before marking future masters complete
5. Local filesystem output only (no public sharing hub)

## Legal Reminder

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility. **No distribution rights are granted by export.**

## Related Docs

- `docs/LOCAL_EXPORTS.md`
- `docs/PREVIEW_SESSION_MANAGEMENT.md`
- `docs/COMBINED_PREVIEW.md`
- `docs/RUBBER_BAND_PROCESSING.md`
