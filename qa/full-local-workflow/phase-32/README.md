# Phase 32 QA evidence index

Primary evidence for the full local workflow QA pass (2026-06-30).

## Quick rerun

```powershell
powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1
```

Requires sidecar at `127.0.0.1:47831` with FFmpeg, Rubber Band, and Demucs on PATH/in venv.

## Logs → workflow step

| Log file | Step |
|----------|------|
| `02-capabilities.json` | Local engine status (FFmpeg, Rubber Band, Demucs, PyTorch) |
| `03-04-metadata-*.json` | Upload/metadata inspection |
| `05-06-analyze-*.json` | BPM/key/phrase (librosa missing — expected) |
| `07-08-stem-preview-*.json` | Stem previews |
| `09-combined-preview.json` | Combined preview + mix controls |
| `10-full-wav-export.json` | Full WAV export |
| `11-mp3-export.json` | MP3 reference export |
| `12-master-export.json` | Mastering preset |
| `13-artifact-list.json` | Artifact browser |
| `14-artifact-metadata-stem-a.json` | Loudness/readout |
| `15-package-export.json` | Project package |
| `16-delete-mp3-artifact.json` | Safe cleanup |
| `17-error-state-sidecar-offline.txt` | Sidecar stopped — connection refused |

Full report: `docs/PHASE_32_FULL_LOCAL_QA.md`
