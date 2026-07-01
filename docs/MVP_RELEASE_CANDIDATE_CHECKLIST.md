# MVP release candidate checklist

**Product:** MashLab AI / CyphaBlend AI  
**Target:** Local Windows MVP release candidate  
**Legal:** Neutral private audio-processing tool — user supplies audio and holds rights.

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

**No public sharing. No cloud upload. No downloader. No streaming imports.**

---

## Quick Mix MVP release candidate (RC2 + polish branch)

| Field | Value |
|-------|-------|
| **Published tag** | `mashlab-quick-mix-real-audio-rc2` (base `fe5f58c`) |
| **Polish branch** | `polish/quick-mix-listening-test` |
| **Phases** | 39 listening polish · 40 true-peak safety |

**Default user flow:** Drop vocal source → drop instrumental source → click **Mix** → local WAV (+ optional MP3).

**Smoke evidence:** `qa/full-local-workflow/phase-40/` (API + browser + real-file operator logs)

```powershell
npm run smoke:quick-mix
npm run smoke:quick-mix:browser   # requires npm run dev + sidecar healthy
```

See [QUICK_MIX_MODE.md](./QUICK_MIX_MODE.md) · [PHASE_40_TRUE_PEAK_SAFETY.md](./PHASE_40_TRUE_PEAK_SAFETY.md)

---

## Quick Mix MVP release candidate (RC1 — historical)

| Field | Value |
|-------|-------|
| **Tag** | `mashlab-quick-mix-mvp-rc1` |
| **Base commit** | `1d6bb44` — Improve sidecar lifecycle and Quick Mix smoke validation |
| **Prior tag** | `mashlab-windows-local-mvp-rc1` (Advanced Studio full workflow) |

**Smoke evidence:** `qa/full-local-workflow/phase-37/` (API + browser logs, browser screenshot manifest)

## 1. Dependency setup

- [ ] Node.js and npm installed (`node -v`, `npm -v`)
- [ ] `npm install` in repo root
- [ ] Sidecar venv created: `local-engine/service/.venv`
- [ ] Base Python deps: `pip install -r requirements.txt`
- [ ] Optional stems: CPU torch + `requirements-stems.txt`
- [ ] Optional analysis: `npm run setup:analysis`
- [ ] FFmpeg + ffprobe on PATH
- [ ] Rubber Band CLI on PATH
- [ ] Record versions: `npm run collect:release-versions`

Reference: [RELEASE_DEPENDENCIES_WINDOWS.md](./RELEASE_DEPENDENCIES_WINDOWS.md)

## 2. Preflight checks

```powershell
npm run setup:windows:check
npm run setup:windows:check:strict
npm run check:local-engine
npm run check:python-service:test:venv
npm run sidecar:status
```

Expected strict tier: venv Python + FFmpeg/ffprobe available (6/7 checks; WSL rhythm optional).

## 3. Start commands

```powershell
npm run start:local:windows
```

Or manual:

```powershell
npm run sidecar:start
npm run dev
```

## 4. Expected local URLs

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:5173/ | Vite React app |
| http://127.0.0.1:47831/health | Sidecar health |
| http://127.0.0.1:47831/v1/capabilities | Dependency capabilities |

## 5. Full workflow summary (user-initiated)

### Quick Mix (default landing — RC1)

1. Drop vocal/acapella source + instrumental/beat source
2. Click **Mix** — orchestrated pipeline: validate → stems (Demucs) → mix → WAV → optional MP3
3. Download local exports (`public_share: false`)

Evidence: `qa/full-local-workflow/phase-37/` · `npm run smoke:quick-mix`

### Advanced Studio (mode switch)

1. Upload two tracks (synthetic test WAVs OK for QA)
2. Inspect metadata / optional BPM/key (librosa)
3. Stem preview both tracks (Demucs)
4. Combined preview (Rubber Band + FFmpeg mix)
5. Full WAV export → MP3 reference → mastering prototype
6. Project package export (`public_share: false`)
7. Artifact browser list + optional cleanup

API validation evidence: `qa/full-local-workflow/phase-32/`  
Librosa lane: `npm run validate:analysis-lane`

## 6. Manual screenshot checklist

Capture in **Chrome or Edge** (or `npm run capture:release-screenshots` with Playwright):

| File | Screen |
|------|--------|
| `01-first-run-guidance.png` | First-run guidance (Advanced Studio) |
| `02-upload-two-tracks.png` | Upload with Track A + B (Advanced Studio) |
| `11-quick-mix-home.png` | Quick Mix default home (Phase 36) |
| `12-quick-mix-output.png` | Quick Mix output screen (Phase 36) |
| `03-local-engine-status.png` | Local Engine Status |
| `04-workflow-checklist.png` | Session workflow checklist |
| `05-analysis-screen.png` | Analysis with librosa available |
| `06-stems-screen.png` | Stems panel |
| `07-combined-preview.png` | Timeline / combined preview |
| `08-export-screen.png` | Export prep |
| `09-artifact-browser.png` | Artifact browser |
| `10-package-result.png` | Package result if available |

Folder: `qa/full-local-workflow/phase-34/screenshots/`  
Manifest: `EVIDENCE_MANIFEST.md`

## 7. Quality gate (release)

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:analysis-lane
npm run package:demo-release
```

## 8. Known limitations

- No public sharing hub, cloud upload, downloader, or streaming import
- librosa BPM/key and phrase lanes are experimental — DJ review required
- Phrase analysis needs detectable beats (not pure sine tones)
- Demucs weights download to user cache on first run
- Mastering/mix limiter prototypes — not certification
- Verified madmom/Essentia rhythm requires optional WSL/Linux setup

## 9. Rights / legal constraints

- User-supplied audio only; user responsible for use and distribution rights
- `RIGHTS_NOTICE.txt` included in project packages
- All exports set `public_share: false`
- No publishing-rights claims in product copy

## 10. Demo package

Optional ZIP (docs + QA logs, no binaries/weights):

```powershell
npm run package:demo-release
```

Output: `qa/full-local-workflow/phase-35/mashlab-local-mvp-demo-package.zip`  
Recipe: `qa/full-local-workflow/phase-35/PACKAGE_RECIPE.md`

## Related docs

- [PHASE_34_RELEASE_DOCUMENTATION.md](./PHASE_34_RELEASE_DOCUMENTATION.md)
- [QA_WORKFLOW_CHECKLIST.md](./QA_WORKFLOW_CHECKLIST.md)
- [CI_CHECKS.md](./CI_CHECKS.md)
