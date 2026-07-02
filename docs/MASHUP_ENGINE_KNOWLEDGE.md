# MashLab AI Mashup Engine Knowledge

## Product Doctrine

MashLab AI is a professional DJ-assistant mashup engine, not a toy one-click auto-remix button.

- Build as a hybrid system: music analysis + DSP + AI stem separation.
- Do not depend on a single "magic model" to do everything.
- Core user loop: load two songs, analyze compatibility, generate a DJ-ready draft, then let DJs manually refine.
- Manual override must exist for beatgrid, BPM, key, phrase markers, stems, transition points, EQ/fades, and render quality.
- Goal: DJ-ready draft quality — not claims of perfect automatic mastering.

## Canonical Product State

Baseline for all future work: **canonical `master`** (currently `dd24daa`).

| Release / phase | What shipped |
|-----------------|--------------|
| **RC4** | Quick Mix section picker — custom vocal/instrumental start, 180s window |
| **RC6** | Remix Brain / DJ sync — anchor alignment, phrase planning, combined preview path |
| **RC7** | Arrangement Brain — Clean Blend, Hook Remix, DJ Edit; bar-aligned structures; style picker |
| **Windows Desktop RC1** (`mashlab-windows-desktop-rc1`) | Clickable Electron portable app; UI at `127.0.0.1:47830`; sidecar at `127.0.0.1:47831` |

**Already in the repo (do not re-implement from scratch):**

- Audio import and browser upload
- Metadata extraction (ffprobe / sidecar)
- Stem separation (Demucs path in sidecar venv)
- BPM/key/heuristic phrase analysis (librosa optional)
- Rubber Band pitch/time processing
- FFmpeg export (WAV primary, MP3 secondary)
- Quick Mix orchestration
- Remix Brain planning and export
- Arrangement Brain planning and multi-section export
- Windows desktop packaging and runtime checks

Scope remains **local-only, rights-neutral** — no downloader, cloud upload, streaming imports, or public sharing.

## Engine Architecture

Target pipeline (design north star; most stages exist in whole or part):

1. Decode/import audio
2. Analyze BPM, beatgrid, downbeats, onsets, tempo drift
3. Analyze key, Camelot/harmonic compatibility, local key/chord changes
4. Detect structure: intro, verse, chorus, hook, breakdown, drop, outro, phrase blocks
5. Choose anchor song/section
6. Separate stems when needed: vocals, drums, bass, other
7. Align globally by BPM/beat/bar/phrase
8. Refine alignment locally with onsets, chroma, optional vocal melody alignment
9. Apply time-stretching and pitch-shifting
10. Render transitions with crossfades, EQ automation, filter moves, gain rides, stem muting, sidechain ducking
11. Run quality checks for clipping, drift, vocal masking, bass conflicts, stem bleed, phase issues, artifacting
12. Export audio plus editable project metadata

## Recommended Stack Notes

Current implementation stack (not a greenfield proposal):

- **Frontend:** Vite + React (Quick Mix + Advanced Studio)
- **Sidecar:** Python FastAPI at `127.0.0.1:47831`
- **Analysis:** librosa (optional in venv), heuristic phrase/BPM/key lanes
- **Stems:** Demucs + PyTorch in sidecar venv
- **DSP:** FFmpeg, Rubber Band CLI on PATH
- **Desktop:** Electron portable shell (Windows Desktop RC1)

Reference / fallback options for future work:

- Spleeter as fast fallback stem separation (not primary today)
- Essentia for deeper MIR (license review required before embed)

Production cautions:

- License review applies to **packaging and distribution** decisions (bundling binaries, installers, commercial ship).
- License concerns are **not blockers for local development** unless we are bundling the dependency into a distributable artifact.
- Do not hardwire GPL/AGPL dependencies into proprietary commercial builds without legal review.
- Demucs quality is strong; plan for upstream maintenance risk.
- Rubber Band: GPL or commercial license path if redistributed.

## Product UX Requirements

Shipped or partially shipped:

- Two-song upload (Quick Mix)
- Analysis / mix progress
- Compatibility and warnings in output panels
- Section picker (RC4)
- Style picker + arrangement card (RC7)
- WAV/MP3 downloads
- Desktop runtime setup dialogs (RC1)

Still evolving toward full mashup-studio UX:

- Dedicated beatgrid editor
- Full phrase/section timeline with drag markers
- Transition editor with automation curves
- Explicit "Generate Draft" / "Preview" / "High Quality Render" tier labels across Advanced Studio
- Rich manual correction for beatgrid/key/phrase without re-upload

## Evaluation Criteria

A generated mashup draft is acceptable only if:

- Downbeats stay aligned
- Phrase entries feel intentional
- Vocal is intelligible
- Bass does not conflict with itself
- Key clash is minimized
- No obvious clipping
- No severe stem artifacts
- Timing drift is controlled
- Output sounds DJ-ready as a draft, not marketed as final mastered record

## Implementation Guardrails

### Do not reset the roadmap

- **Do not rebuild** existing import, stem, Remix Brain, or Arrangement Brain systems unless fixing a **specific bug** or extending with a scoped feature.
- **Do not create** a separate rewrite app or unrelated history branch. All future work branches from **canonical `master`**.
- **Do not overbuild** new UI shells before the underlying audio path is verified.

### Shipped foundation (reference)

| Area | Status |
|------|--------|
| Import + metadata | Shipped |
| BPM/beat/key analysis | Shipped (heuristic + overrides) |
| Stem separation | Shipped (Demucs) |
| Mashup planning | Shipped (Remix Brain + Arrangement Brain) |
| Render / export | Shipped (Quick Mix WAV/MP3) |
| Windows desktop | Shipped (RC1) |

### Next recommended phase

**Phase 45 — Windows First-Run Setup Assistant**

Goal: make the desktop app guide the user through missing dependencies:

- Python sidecar venv creation
- Demucs/PyTorch install in venv
- FFmpeg / ffprobe on PATH
- Rubber Band CLI on PATH
- PATH detection and clear remediation steps
- Sidecar startup verification
- Port conflict detection (`47830` UI, `47831` sidecar)

Deliverables: in-app or first-launch wizard, links to `docs/WINDOWS_USER_RUN_GUIDE.md`, non-blocking launch when optional lanes are missing, blocking guidance when Quick Mix processing cannot run.

### Anti-goals (unchanged)

- Full generative AI music creation
- End-to-end neural mashup model
- Social/sharing / cloud upload features
- Claims of perfect automatic results

## Related Docs

- `docs/QUICK_MIX_MODE.md` — Quick Mix orchestration
- `docs/PHASE_42_REMIX_BRAIN_DJ_SYNC_ENGINE.md` — Remix Brain
- `docs/PHASE_43_ARRANGEMENT_BRAIN.md` — Arrangement Brain
- `docs/WINDOWS_DESKTOP_PACKAGING.md` — Desktop RC1
- `docs/WINDOWS_USER_RUN_GUIDE.md` — End-user desktop setup
