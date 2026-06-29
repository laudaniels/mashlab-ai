# Export and Mastering Plan — Phase 12 Scaffolding

Export and mastering are **not implemented** in the MVP. Phase 12 adds a locked prep panel and documents the future lane only.

## Current State

- Preview artifacts exist locally (stem, combined, pitch/time previews)
- Preview WAVs are **not** final masters
- No WAV/MP3/stem package export rendering
- No loudness normalization pass for final delivery
- No true-peak limiting for publish-ready output

The export screen states:

> Export is not implemented yet. Current previews are not final masters.

## Planned Export Targets (Future)

| Target | Purpose | Status |
|--------|---------|--------|
| WAV export | Primary lossless master | Locked / planned |
| MP3 export | Compressed reference render | Locked / planned |
| Stems export | Separated stem package | Locked / planned |
| DJ-safe preview master | Loudness-checked review master | Locked / planned |

## Planned Loudness Targets (Future, Not Active)

These are **design targets** for a future export lane — not applied to current previews:

| Profile | Integrated loudness | True peak |
|---------|---------------------|-----------|
| General playback | ~ -14 LUFS | ~ -1 dBTP |
| Club version | TBD (planned) | TBD (planned) |

Current preview metadata readout may measure loudness for **review only**. That does not mean the preview is mastered or publish-ready.

## Architecture Notes (Future Implementation)

1. Explicit user export action (no auto-export)
2. Render from session artifacts + approved plan state
3. FFmpeg/Rubber Band/Demucs pipelines already proven in preview lanes
4. Loudness/true-peak validation gate before marking export complete
5. Local filesystem output only in MVP (no public sharing hub)

## Legal Reminder

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Related Docs

- `docs/PREVIEW_SESSION_MANAGEMENT.md`
- `docs/COMBINED_PREVIEW.md`
- `docs/RUBBER_BAND_PROCESSING.md`
