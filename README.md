# MashLab AI / CyphaBlend AI

Two songs in. A DJ-ready mashup out.

This repository is the initial product foundation for a private, local-first AI-assisted DJ mashup application. The current app accepts two user-supplied audio files, inspects browser-available metadata locally, renders a lightweight waveform summary when decoding succeeds, and shows clearly labeled placeholders for the future analysis, stem, arrangement, and export engines.

## Stack

- Vite + React + TypeScript for a fast professional frontend shell.
- Browser Web Audio APIs for the safe local-only upload metadata prototype.
- Plain CSS for a focused pro-audio interface without locking the project into a design system too early.
- Future engine adapters are separated across `src/domain/enginePlan.ts`, `src/engines/`, and `src/lib/analysisPipeline.ts` so Demucs, BeatNet+, Essentia, Rubber Band, and export/mastering services can be added behind stable boundaries.

## Current Status

Implemented:

- Two local audio upload slots.
- Browser-local file validation and metadata inspection.
- WAV container sample-rate/channel parsing when available.
- Web Audio decoding for duration and waveform summaries when the browser supports the file.
- Honest adapter-hook placeholders for beat/key/stem analysis.

Not implemented yet:

- BPM/key detection, beat/downbeat grids, phrase detection, stem separation, AI arrangement, pitch/time processing, vocal cleanup, mastering, or export rendering.

## Legal Notice

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

The app does not provide music, does not include a downloader, does not connect to streaming services, and does not include a public sharing hub in the MVP.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Quality Commands

```bash
npm run lint
npm run typecheck
npm run build
npm test
```
