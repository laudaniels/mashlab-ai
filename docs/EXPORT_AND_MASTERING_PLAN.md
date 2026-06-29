# Export and Mastering Plan

## Current State (Phase 14)

- **Full-length WAV export** re-renders from stem artifacts + session plan (Rubber Band + FFmpeg full mix)
- **Preview-length WAV export** copies existing combined preview artifact (Phase 13)
- Export panel unlocks when both stem previews exist **or** a combined preview exists
- Loudness gate displays pass/warn/not_available against planned general targets (informational only)
- MP3, stem package export, club mastering, and public sharing remain **not implemented**

Preview artifacts (stem, combined, pitch/time) remain `finalExport: false`.

## Phase 14 Full-Length Export (Implemented)

| Item | Status |
|------|--------|
| Full-length WAV from stem artifacts + plan | Available (user-initiated) |
| Rubber Band vocal + FFmpeg full mix | Available when dependencies present |
| Loudness gate readout (informational) | Available when FFmpeg measures |
| Preview-length copy from combined preview | Available (Phase 13) |

See `docs/LOCAL_EXPORTS.md` for API and storage details.

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
