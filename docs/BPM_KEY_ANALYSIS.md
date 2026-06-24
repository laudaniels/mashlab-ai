# BPM / Key Analysis — Phase 5 Prototype

MashLab AI / CyphaBlend AI uses an **experimental local-service prototype** for BPM/beat and key estimation when optional dependencies are installed.

## What Is Implemented

### Beat / BPM lane
- Endpoint: `POST /v1/analyze/beat`
- Method: `librosa.beat.beat_track`
- Returns when available:
  - `bpm`
  - `beat_times`
  - `beat_count`
  - `method`
  - `limitations`
  - `confidence` (only when computed)
- Honest not-implemented flags:
  - `downbeat_status: not_implemented`
  - `phrase_marker_status: not_implemented`

### Key lane
- Endpoint: `POST /v1/analyze/key`
- Method: `librosa chroma_cqt` + Krumhansl-style major/minor correlation
- Returns when available:
  - `key`
  - `mode` (`major` / `minor` / `unknown`)
  - `camelot` (heuristic DJ reference code)
  - `method`
  - `limitations`
  - `confidence` (only when computed)

## Optional Dependencies

Install in the service virtual environment:

```powershell
cd local-engine\service
pip install -r requirements-analysis.txt
```

Packages:
- `librosa`
- `soundfile`
- `numpy`

MP3/M4A decoding may also require FFmpeg on PATH.

## Limitations (Important)

This phase is **not pro-grade MIR**:
- Tempo doubling/halving can occur
- Sparse or heavily produced material can reduce beat confidence
- Key detection is experimental and can misidentify mode/key
- Camelot codes are heuristic helpers, not legal or licensing guidance
- Downbeats, phrase markers, energy curves, and harmonic match planning are still future work

Label all UI output as **prototype**.

## Browser-Only Fallback

If the sidecar is offline or librosa is missing:
- Upload still works
- Browser metadata/waveform still works
- Beat/key lanes show honest pending or missing dependency labels
- No fake BPM/key values are generated in the browser

## Future Upgrade Path

| Current prototype | Planned upgrade |
|-------------------|-----------------|
| librosa beat_track | BeatNet+ / Essentia downbeat-aware grids |
| chroma/CQT correlation | Essentia key profiles + confidence guardrails |
| local multipart upload | session-scoped artifact reuse |
| experimental labels | DJ-facing confidence thresholds and edit tools |

Essentia remains optional/planned in `/v1/capabilities` until explicitly integrated.

## Privacy

Audio is uploaded only to the user's local helper service at `127.0.0.1`. MashLab does not provide music, streaming imports, downloaders, or a public sharing hub.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.
