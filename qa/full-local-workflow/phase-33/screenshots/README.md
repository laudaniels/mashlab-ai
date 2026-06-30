# Phase 33 manual UI screenshots

Cursor browser automation could not render the MashLab React/Vite app (blank DOM capture). Capture these manually from http://127.0.0.1:5173 with the sidecar running (`npm run sidecar:status`).

Prerequisites:

```powershell
npm run sidecar:start
npm run dev
```

## Required captures

Save PNG files in this folder:

| Filename | Screen |
|----------|--------|
| `01-first-run-guidance.png` | First-run guidance panel visible |
| `02-local-engine-status.png` | Local Engine Status — FFmpeg, Rubber Band, Demucs, PyTorch available |
| `03-upload-two-tracks.png` | Upload screen with Track A + Track B loaded |
| `04-workflow-checklist.png` | Sidebar session checklist |
| `05-artifact-browser.png` | Artifact browser after Phase 32 QA artifacts |
| `06-export-panels.png` | Export / master / package panels if accessible |

Use synthetic or authorized test audio only. Do not use copyrighted commercial tracks.

## Automation limitation log

- Tool: Cursor IDE browser MCP + CDP `document.body.innerText` returned empty
- Screenshot: solid black frame (`screenshots/automation-blank-capture.png` if copied from Phase 32 attempt)
- API + JSON QA evidence remains authoritative for processing validation (`qa/full-local-workflow/phase-32/logs/`)
