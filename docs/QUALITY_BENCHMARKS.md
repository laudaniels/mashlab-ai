# Quality Benchmarks

## Product Honesty

- No fake AI processing.
- Every pending engine result must be labeled "engine pending" or "analysis coming next."
- No copyrighted-song examples.
- No downloader or streaming integration.
- No public sharing hub in the MVP.

## Audio Benchmarks

Future engine work should be evaluated against:

- Beat grid accuracy.
- Downbeat accuracy.
- Tempo stability across intros, breakdowns, and tempo drift.
- Key detection confidence.
- Pitch-shift artifact limits.
- Stem bleed and artifact levels.
- Vocal intelligibility after cleanup.
- Phase coherence in blends.
- LUFS and true peak export targets.
- Club playback headroom.

## UX Benchmarks

- User can see both loaded files and their metadata without hunting.
- The app makes clear what is local, what is pending, and what is export-ready.
- Controls use DJ/pro-audio language: tempo, key, phrase, stems, levels, export.
- The legal notice is visible at upload and export, but the workflow remains usable.
- The UI should feel like a professional tool, not a novelty toy.

## Engineering Benchmarks

- Strict TypeScript.
- Lint, typecheck, and build pass before reporting work complete.
- File handling remains local in the prototype.
- Engine integrations use adapters instead of direct UI coupling.
- Long-running processing will need cancellable job status and explicit failure states.
