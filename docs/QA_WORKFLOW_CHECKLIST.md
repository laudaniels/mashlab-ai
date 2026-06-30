# QA Workflow Checklist (Phase 19–32)

Manual and automated verification for the full local DJ workflow in MashLab AI / CyphaBlend AI. **Nothing auto-processes** — each step requires explicit user action.

## Environment Setup (run first)

**Windows:** see `docs/WINDOWS_RUNTIME_SETUP.md` for PATH setup, npm scripts, and interpreting failures.

```powershell
npm run setup:windows:check
npm run setup:windows:guide
npm run start:local
npm run check:local-engine
```

| Dependency | Tier | Required for | PATH / install |
|------------|------|--------------|----------------|
| **Browser MVP** | Always | Upload, overrides, planning | `npm run dev` only |
| **Python 3.10+** | Processing | Sidecar service | PATH + venv in `local-engine/service` |
| **FFmpeg + ffprobe** | Processing | Mix, export, loudness readout | Standard FFmpeg release on PATH |
| **Rubber Band CLI** | Processing | Pitch/time + combined preview | `rubberband-cli` on PATH |
| **Demucs + PyTorch** | Processing | Stem preview separation | `requirements-stems.txt` in venv |
| **librosa** | Optional | BPM/key analysis lanes | `requirements-analysis.txt` |
| **WSL rhythm** | Optional | Verified madmom/Essentia downbeats | `npm run sidecar:wsl:check` |

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
npm run setup:windows:check
```

If `check:local-engine` or `setup:windows:check` reports FFmpeg missing, install FFmpeg, add its bin folder to PATH, open a new terminal, and rerun — do not treat PATH misconfiguration as a product defect.

**Phase 32 full local QA (automated):** see `docs/PHASE_32_FULL_LOCAL_QA.md` and run:

```powershell
powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1
```

Use synthetic test audio only. When librosa is missing, set `neutral_processing=true` for combined preview and full WAV export (matches DJ override / neutral path in the UI).

## Phase 32 verified (2026-06-30)

End-to-end API workflow **PASS** on Windows 11 with FFmpeg + Rubber Band 4.0.0 + torch 2.5.1+cpu + Demucs 4.0.1:

- [x] Metadata for two synthetic tracks
- [x] Stem previews (both tracks)
- [x] Combined preview with mix controls
- [x] Full WAV export (`final_export: true`, `public_share: false`)
- [x] MP3 reference export
- [x] Mastering preset (`club_loudness_prototype`)
- [x] Project package with manifest + RIGHTS_NOTICE
- [x] Artifact list, metadata/loudness readout
- [x] Safe artifact delete
- [x] Sidecar offline → connection refused (Browser MVP remains available in UI)

Evidence: `qa/full-local-workflow/phase-32/logs/`

## Phase 33 verified (production hardening)

- [x] `check:python-service` prefers sidecar venv when global python missing
- [x] `setup:windows:check:strict` passes with venv Python + FFmpeg on PATH
- [x] `npm run sidecar:start|status|stop` — single-instance lifecycle
- [x] `npm run setup:analysis:dry-run` documents optional librosa path
- [ ] Manual UI screenshots — see `qa/full-local-workflow/phase-33/screenshots/README.md`

## Phase 34 verified (release documentation)

- [x] `npm run start:local:windows` — preflight, sidecar, Vite in new window
- [x] `npm run setup:analysis` — librosa 0.11.0 in sidecar venv
- [x] `npm run validate:analysis-lane` — beat/key PASS; phrases honest on sine clip
- [x] Capabilities show librosa + beat/key lanes available after sidecar restart
- [ ] Manual UI screenshots — see `qa/full-local-workflow/phase-34/screenshots/README.md`

### Phase 34 local demo checklist

- [ ] `npm run setup:windows:check:strict` passes
- [ ] `npm run start:local:windows` opens app + sidecar URLs printed
- [ ] `npm run sidecar:status` → healthy
- [ ] Upload two synthetic/non-copyright tracks
- [ ] Session checklist progresses (user-initiated steps)
- [ ] Optional: BPM/key analysis after `setup:analysis`

### Phase 34 optional librosa checklist

- [ ] `npm run setup:analysis`
- [ ] Restart sidecar (`sidecar:stop` / kill 47831 / `sidecar:start`)
- [ ] `/v1/capabilities` → librosa available
- [ ] Beat/key analysis on test WAV — not missing_dependency
- [ ] Phrase lane honest when no beats detected (sine clip)

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

## Phase 26: Rhythm engine self-test

- [ ] **Run rhythm self-test** button on Timeline / Local Engine Status (manual only — not auto-run)
- [ ] Self-test notice: no user audio processed
- [ ] Heuristic engine shows pass on Windows with librosa
- [ ] madmom/Essentia show missing_dependency or not_configured on Windows without optional deps
- [ ] Verified labels appear only when self-test reports real markers
- [ ] Setup guidance shown for missing engines
- [ ] WSL/Linux path documented in `docs/WSL_RHYTHM_ENGINE_SETUP.md`
- [ ] `npm run sidecar:wsl:check` prints Windows fallback when WSL missing
- [ ] DJ review notice visible; rights notice unchanged

## Phase 27: WSL sidecar dev profile

- [ ] `npm run sidecar:wsl:setup` documented (optional, WSL only)
- [ ] `npm run sidecar:wsl:selftest` non-strict exits 0 when sidecar offline on Windows
- [ ] Synthetic validation fixture — no copyrighted audio
- [ ] GitHub Actions rhythm workflow is manual (`workflow_dispatch`) only
- [ ] Verified labels only when advanced engine returns real markers

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
