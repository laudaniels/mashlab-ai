# QA Workflow Checklist (Phase 19–20)

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

### 5b. Arrangement draft plan (Phase 20–21)
- [ ] Drafts / Timeline / Export show Arrangement Plan panel
- [ ] Three templates: Clean Blend, Club Edit, Creative Blend
- [ ] Section timeline rows are selectable (advisory only)
- [ ] **Apply section to preview settings** configures duration/offset/mix — no auto-processing
- [ ] Missing requirements show **Go to required step** navigation
- [ ] Combined Preview shows bound section and start offset status
- [ ] Plan shows phrase basis honestly (beats / heuristic / DJ override / unavailable)
- [ ] "Plan only — no audio is processed until you click preview or export" visible
- [ ] User must still click Create combined preview or Export manually
- [ ] Rights notice visible on arrangement panel

### 5c. Arrangement traceability (Phase 22)
- [ ] Apply section saves context snapshot (`planningOnly`, `djReviewRequired`)
- [ ] Combined preview / export / artifact browser show section summary when context present
- [ ] Stale binding warning after changing mash intent, mix, overrides, or stems
- [ ] Re-apply section settings works without blocking export
- [ ] Full-length export shows "Arrangement context only — full-length render" when context attached
- [ ] Package manifest / technical report include arrangement contexts when present
- [ ] No verse/chorus/drop detection claims in labels or metadata

### 5d. Section window export (Phase 23)
- [ ] Export screen shows **Section Window Export** with draft type, section label, start/duration, phrase basis
- [ ] Context diff summary shows when bound vs current session differs
- [ ] Readiness checklist: stems, Rubber Band, FFmpeg, duration, rights, advisory confirm
- [ ] Stale context requires explicit confirmation before export
- [ ] Unavailable start requires "start from artifact beginning" confirmation
- [ ] Missing duration blocks export with actionable error
- [ ] Output: `section-export.wav` under `.work/artifacts/exports/{id}/`
- [ ] Artifact browser shows `export / section-wav` with traceability
- [ ] `finalExport: true`, `publicShare: false`, `sectionTrimmedExport: true`
- [ ] Package manifest includes section export arrangement context when selected

### 5e. Phrase / downbeat analysis (Phase 24)
- [ ] Capabilities list heuristic + verified lanes and optional Essentia/BeatNet/madmom status
- [ ] Phrase Analysis panel on Timeline — user-initiated only
- [ ] Heuristic fallback when advanced deps missing
- [ ] No fake verified labels when downbeats not detected
- [ ] Arrangement drafts prefer verified phrase evidence over heuristic when present
- [ ] Arrangement context includes phrase evidence fields when bound
- [ ] DJ review notice visible; rights notice unchanged

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
- Arrangement draft panel (Phase 20)
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

- `scripts/verify-core.mts` — workflow readiness, dependency health, error formatting, artifact lifecycle, rights audit, package defaults, **arrangement draft intelligence**
- `local-engine/service/tests/test_artifact_deletion_safety.py`
- `local-engine/service/tests/test_error_responses.py`
- `local-engine/service/tests/test_dependency_status.py`
