# Technical Architecture

## MVP Stack

- Frontend: Vite, React, TypeScript.
- Styling: plain CSS with a focused pro-audio visual system.
- Local prototype audio inspection: browser Web Audio API and media metadata.
- Future native/audio services: adapter-driven engines behind typed contracts.

## Architecture Goals

- Keep UI, domain contracts, audio inspection, engine adapters, and legal notices separate.
- Prefer local-first processing where practical.
- Never silently upload user files.
- Mark unimplemented intelligence as "engine pending" or "analysis coming next."
- Keep future server/native audio work replaceable through adapters.

## Current Structure

```text
src/
  App.tsx
  main.tsx
  styles.css
  components/
    TrackAnalysisPanel.tsx
  domain/
    enginePlan.ts
    types.ts
  engines/
    contracts.ts
    engineRegistry.ts
    stubEngines.ts
    index.ts
  hooks/
    useMashAnalysis.ts
  lib/
    analysisPipeline.ts
    audioMetadata.ts
    legal.ts
  scripts/
    verify-core.mts
```

## Implemented Adapter Skeleton

`src/engines/contracts.ts` defines typed result shapes for beat/key analysis, stem separation, pitch/time planning, vocal cleanup, arrangement drafts, and export/mastering. `src/engines/stubEngines.ts` keeps these lanes honest by returning pending results instead of fabricated audio intelligence.

`src/lib/analysisPipeline.ts` currently runs the beat, key, and stem lanes used by the analysis dashboard. Adapter failures are isolated per lane so one future engine failure does not collapse the whole analysis panel.

## Future Engine Boundaries

The MVP defines adapter lanes for:

- Stem separation: Demucs / HTDemucs, MDX-Net, UVR-style options, optional commercial APIs later.
- Beat/downbeat/tempo/phrase analysis: BeatNet+, Essentia, librosa or madmom-style MIR tooling.
- Key/harmonic matching: key detection, Camelot-style compatibility, relative major/minor, pitch-shift limits.
- Pitch/time processing: Rubber Band as preferred high-quality engine, SoundTouch as lightweight fallback.
- Vocal cleanup/tone matching: gain staging, EQ, compression, de-essing, reverb/delay matching, artifact reduction.
- Arrangement intelligence: 8/16/32-bar phrasing, intro/outro edits, hook-over-drop, clean blend, club blend, creative blend.
- Mastering/export: LUFS, true peak, headroom, WAV/MP3/stem export.

## Near-Term Runtime Options

The likely next implementation is a local worker or backend service that owns heavy audio processing. The frontend should submit user-approved local files to a local process, receive analysis JSON and preview audio, and keep long-running work cancellable.

Potential backends:

- Python service for Demucs, Essentia, librosa, and audio analysis orchestration.
- Native command wrappers for Rubber Band and FFmpeg.
- Node/Vite frontend for state, waveform, controls, and export review.

## Privacy Model

The current prototype reads files in the browser only. Future server or native processing must make file movement explicit in product copy and settings. No training use is allowed without a later explicit opt-in program.
