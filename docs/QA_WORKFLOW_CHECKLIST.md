# QA Workflow Checklist (Phase 19)

Manual and automated verification for the full local DJ workflow in MashLab AI / CyphaBlend AI. **Nothing auto-processes** — each step requires explicit user action.

## Environment Setup (run first)

| Dependency | Required for | PATH / install |
|------------|--------------|----------------|
| **Python 3.12+** | Sidecar service | Add `Python312` and `Scripts` to PATH. Verify: `python --version` |
| **FFmpeg + ffprobe** | Mix, export, loudness readout | Install FFmpeg; add bin dir to PATH. Verify: `npm run check:local-engine` |
| **Rubber Band CLI** | Pitch/time + combined preview | Install `rubberband-cli`; ensure `rubberband` on PATH |
| **Demucs + PyTorch** | Stem preview separation | `pip install torch demucs` in `local-engine/service` venv |
| **librosa** (optional) | BPM/key analysis lanes | `pip install -r requirements-analysis.txt` |

Start sidecar:

```powershell
cd local-engine\service
python -m uvicorn main:app --host 127.0.0.1 --port 47831
```

Quality commands:

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run check:python-service && npm run check:python-service:test
npm run check:local-engine
```

If `check:local-engine` fails only because FFmpeg is off PATH, add FFmpeg for the session and rerun — do not treat PATH misconfiguration as a product defect.

## End-to-End Workflow Checklist

### 1. Upload Track A and Track B
- [ ] Both slots accept local audio files
- [ ] Browser metadata inspection succeeds or fails with a clear message
- [ ] Rights notice visible on upload screen

### 2. Inspect metadata
- [ ] Duration, sample rate, channels shown when available
- [ ] No fake values when decode fails

### 3. BPM/key analysis (when sidecar + librosa available)
- [ ] Beat and key lanes complete per track
- [ ] Offline sidecar shows browser-only fallback without crash

### 4. DJ overrides
- [ ] BPM, key, Camelot, alignment offset, phrase length editable
- [ ] Overrides persist in session storage (no raw audio)

### 5. Stem previews
- [ ] Demucs lane reports available when torch+demucs installed
- [ ] User clicks to create stem preview per track
- [ ] Artifacts stored under `.work/artifacts/stems/{id}/`

### 6. Combined preview
- [ ] Requires stem previews for both tracks (or documented neutral path)
- [ ] Rubber Band + FFmpeg required
- [ ] Output labeled preview-only; `final_export: false`

### 7. Mix controls
- [ ] Adjust gain/fades/limiter before new preview or full export
- [ ] Settings do not retroactively change existing artifacts

### 8. Full-length WAV export
- [ ] Uses stem artifacts + plan state
- [ ] Rights acknowledgment required
- [ ] Output under `.work/artifacts/exports/{id}/`

### 9. MP3 reference export
- [ ] Requires existing WAV export artifact
- [ ] Labeled reference export — not distribution proof

### 10. Mastering preset
- [ ] Requires WAV export source
- [ ] Prototype warnings shown; no club-ready certification language

### 11. Project package
- [ ] Bundles selected artifacts only (no raw uploads)
- [ ] Includes `manifest.json` and `RIGHTS_NOTICE.txt`
- [ ] `public_share: false`

### 12. Inspect artifacts
- [ ] Artifact browser lists stems, previews, exports, masters, packages
- [ ] Loudness readout honest when `not_available`

### 13. Delete / cleanup
- [ ] Single artifact delete works per type
- [ ] Clear session removes artifacts under `.work/artifacts` only
- [ ] Path traversal ids rejected (`../escape`)
- [ ] Delete failures surface actionable errors in UI

## Session Checklist UI

The sidebar **Session checklist** panel mirrors this workflow with statuses:

- **Complete** — step satisfied
- **Partial** — one of two tracks / one artifact
- **Pending** — ready for user action
- **Blocked** — missing dependency or prerequisite

## Rights Doctrine (every release check)

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

Verify presence in:

- Upload screen
- Combined preview panel
- Export prep panel
- Mastering section
- Package export section
- Artifact browser labels
- Sidebar mini-notice
- Dedicated rights screen
- Docs (`LEGAL_DOCTRINE.md`, this file)

**Must not appear:** publishing-rights grants, public sharing hub language, streaming integration claims.

## Known Limitations

- No public sharing, cloud upload, downloader, or streaming integrations
- Mastering and mix limiter/clipping guard are prototypes only
- Loudness gate is informational — not certification
- Default shell PATH may not include Python or FFmpeg on Windows — configure explicitly

## Automated Coverage

- `scripts/verify-core.mts` — workflow readiness, dependency health, error formatting, artifact lifecycle, rights audit, package defaults
- `local-engine/service/tests/test_artifact_deletion_safety.py`
- `local-engine/service/tests/test_error_responses.py`
- `local-engine/service/tests/test_dependency_status.py`
