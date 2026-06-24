# Audio Pipeline

## Current Prototype

The browser accepts two local audio files and attempts:

1. File validation through MIME type and filename extension.
2. Media metadata duration lookup.
3. WAV container sample-rate/channel parsing when available.
4. Web Audio decoding for duration and waveform peaks.
5. UI rendering of safe local metadata.

No stem separation, BPM detection, key detection, AI arrangement, mastering, or export rendering is currently performed.

## Target Pipeline

1. Ingest user-supplied local audio.
2. Probe format, duration, sample rate, channels, bitrate, and loudness.
3. Normalize working copies to a consistent internal format.
4. Separate stems with Demucs / HTDemucs, MDX-Net, or UVR-style models.
5. Detect beat grid, downbeats, tempo, phrases, and energy curve.
6. Detect musical key and harmonic compatibility.
7. Estimate pitch/time changes within acceptable quality limits.
8. Build arrangement candidates: clean blend, club blend, hook-over-drop, creative blend.
9. Apply vocal cleanup and tone matching.
10. Render preview drafts.
11. Let the user adjust timing, key, tempo, vocal level, reverb, tone, energy, and intro/outro length.
12. Export DJ-safe WAV, MP3, and optional stem packages.

## Adapter Notes

### Stem Separation

Primary path: Demucs / HTDemucs. Alternative path: MDX-Net or UVR-style models. Future commercial APIs can be added only behind the same job adapter shape.

### Beat, Downbeat, Tempo, Phrase

Primary research lane: BeatNet+ and Essentia. Prototype lane may include librosa or madmom-style analysis for quick iteration.

### Key and Harmony

Detect key, map to Camelot-style compatibility, support relative major/minor, and constrain pitch shifts to musical and audio-quality limits.

### Pitch and Time

Rubber Band is the preferred high-quality engine. SoundTouch can be used as a lightweight fallback for faster previews or constrained environments.

### Vocal Cleanup and Tone

Chain should support gain staging, EQ, compression, de-essing, reverb/delay matching, and artifact reduction. The UI must expose user controls without claiming automatic perfection.

### Export and Mastering

Export should target DJ-safe loudness and true peak ceilings with adequate headroom. WAV is the primary professional export path; MP3 and stem export are later options.
