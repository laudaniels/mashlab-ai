# MVP Roadmap

## Phase 0: Foundation

- Create project structure.
- Add product, legal, architecture, audio pipeline, benchmarks, and roadmap docs.
- Choose practical MVP stack.
- Include legal doctrine in docs and UI copy plan.

## Phase 1: Application Skeleton

- Landing/project intro.
- Two-track upload workspace.
- Analysis dashboard placeholder.
- Stem separation status placeholder.
- Mashup draft generation placeholder.
- Timeline/arrangement preview placeholder.
- Export panel placeholder.
- Legal/use responsibility notice.

## Phase 2: Local Audio Analysis Prototype

- Accept local audio files.
- Inspect browser-available metadata.
- Display file name, format, size, duration, sample rate, channel count.
- Render basic waveform summary when Web Audio decoding succeeds.
- Prepare BPM, key, stem, beat grid, and phrase analysis hooks.

## Phase 3: Engine Planning

- Stem separation adapter.
- Beat/downbeat adapter.
- Key detection adapter.
- Pitch/time processing adapter.
- Vocal cleanup chain.
- Arrangement engine.
- Export/mastering engine.

## Phase 4: First Real Audio Engine

Recommended next build: local analysis service with FFmpeg probing, BPM/key estimation, and durable job status. This creates a real processing backbone before expensive stem separation is added.

## Phase 5: Stem and Arrangement Drafts

Add stem separation, phrase-aware arrangement generation, preview renders, and human-edit controls.

## Phase 6: DJ-Safe Export

Add WAV export, optional MP3 export, stem export, loudness targets, true peak limiting, and export compliance copy.
