# Phase 34 manual UI screenshots

Capture **real** screenshots from a local browser session — do not use blank automation captures.

## Start the demo

```powershell
npm run start:local:windows
```

Or manually:

```powershell
npm run sidecar:start
npm run dev
```

Open http://127.0.0.1:5173/

Use synthetic test audio from `qa/full-local-workflow/phase-32/test-audio/` or other non-copyright clips you are authorized to use.

## Required captures

| File | Screen |
|------|--------|
| `01-first-run-guidance.png` | First-run guidance panel |
| `02-upload-two-tracks.png` | Upload with Track A + Track B |
| `03-local-engine-status.png` | Local Engine Status — FFmpeg, Rubber Band, Demucs, PyTorch (librosa if installed) |
| `04-workflow-checklist.png` | Sidebar session checklist |
| `05-analysis-screen.png` | Analysis / timeline with BPM/key or librosa status |
| `06-stems-screen.png` | Stem separation panel |
| `07-combined-preview.png` | Combined preview panel |
| `08-export-screen.png` | Export prep panel |
| `09-artifact-browser.png` | Artifact browser |
| `10-package-result.png` | Package/export result if available |

## Automation limitation (Phase 33–34)

Cursor IDE browser MCP and CDP returned empty DOM / black frames for the Vite/React app. **Manual capture is required** until a supported browser automation path is available.

Processing validation evidence: `qa/full-local-workflow/phase-32/logs/` (API QA) and `qa/full-local-workflow/phase-34/logs/` (librosa validation).
