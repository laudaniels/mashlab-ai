# Phase 41 ? Quick Mix section picker

**Product:** MashLab AI / CyphaBlend AI  
**Baseline tag:** `mashlab-quick-mix-listening-rc3` (`2e7773c`)  
**Scope:** Choose which 180 seconds to process ? default behavior unchanged.

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

**Local-only. No cloud upload. No downloader. No streaming imports. No public sharing.**

---

## Why the 180-second cap remains

CPU Demucs stem separation is reliable on ~3-minute windows. Phase 41 does **not** increase the cap ? it lets users pick **which** 180 seconds (hook, chorus, drop, custom intro) instead of always the first 3:00.

Trimming happens **before** Demucs (FFmpeg prep endpoint and/or stem `preview_start_seconds`) so the sidecar never runs separation on full-length songs.

## User flow (unchanged simplicity)

1. Vocal source  
2. Instrumental source  
3. **Section to use** (optional ? defaults to First 3:00)  
4. **Mix**  
5. Local WAV + optional MP3  

Not Advanced Studio ? no arrangement planner, section export, or multi-track timeline.

## Section picker UI

Under each upload card after a file is selected:

**Section to use**
- **First 3:00** (default ? matches RC3)
- **Custom start** ? minutes / seconds  
  - Helper: *MashLab will process 3:00 from this point.*

Optional: **Use the same start time for both sources** ? when enabled, instrumental follows vocal start.

No auto-processing on drop. Prep/trim runs at **Mix** time with the selected offset.

## Default behavior (RC3 preserved)

If the user changes nothing:

| Setting | Value |
|---------|-------|
| Section | First 3:00 (offset 0) |
| Window | 180 s |
| Vocal gain | +1.5 dB |
| Bed gain | ?3.0 dB |
| Master | ?1.0 dB |
| Limiter + clip guard | on |
| Bed duck | on |

## Custom start examples

| Source | Start | Processed window |
|--------|-------|------------------|
| Vocal (Track A) | 1:05 | 1:05?4:05 |
| Instrumental (Track B) | 0:42 | 0:42?3:42 |
| Length cap | ? | 3:00 MVP |

Output panel shows:

- Vocal section: 1:05?4:05  
- Instrumental section: 0:42?3:42  
- Length: 3:00 MVP cap  

Technical artifact IDs stay collapsed.

## Sidecar / API

| Field | Role |
|-------|------|
| `start_offset_seconds` | Quick Mix source prep (`POST /v1/process/quick-mix-source-prep`) |
| `preview_start_seconds` | Stem preview when raw file sent without prep |
| `max_preview_seconds` / `max_seconds` | 180 MVP cap |
| Source role | vocal ? Track A / vocals stem; instrumental ? Track B / no_vocals stem |

Validation errors (structured):

- *Start time is past the end of this file.*  
- *This file is shorter than the selected section.*  
- *Could not read duration. Try First 3:00.*

Failures do **not** show Done.

## Tests added/updated

**Node (`npm test`):** default 180 s, custom offsets, payload fields, output lines, no false Done, cap disclosure, local-only copy.

**Python (`npm run check:python-service:test`):** FFmpeg offset trim command, prep validation, stem preview offset rejection before Demucs.

## QA checklist

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-engine
npm run setup:windows:check
npm run setup:windows:check:strict
npm run check:python-service
npm run check:python-service:test
npm run smoke:quick-mix
npm run smoke:quick-mix:browser
```

Real-file browser QA (**2026-07-01**, Track A / Track B only — ~201 s / ~205 s MP3 pair, 22 candidates found in bounded local search; no filenames in repo):

| Case | Starts (vocal / instrumental) | Time (s) | WAV artifact | MP3 artifact | Sidecar | Console | Playable |
|------|----------------------------------|----------|--------------|--------------|---------|---------|----------|
| Default First 3:00 | 0:00 / 0:00 | 115 | `fbb9fadc04fe4729b3e973247f844550` | `6bb0e969abcd4897a2c8ac70d7d7d652` | healthy | none | yes |
| Custom vocal 1:05 | 1:05 / 0:00 | 99 | `82e85a9c0ccd43f18ccd0cbd01cf6657` | `167fa4046bb84c598f8fc8dbad3bd644` | healthy | none | yes |
| Custom instrumental 0:42 | 0:00 / 0:42 | 116 | `ae53117c0c6e4c2c85b6835732acc229` | `a2ef94ca676644f989a1d2b01795d2fd` | healthy | none | yes |
| Different starts | 1:05 / 0:42 | 103 | `6ec74243b9fd486f9437fc67073919fb` | `07681197db324cb59c4b7d75a35eb43b` | healthy | none | yes |
| Shorter synthetic (15 s) | 0:00 / 0:00 | 24 | `51a79c8f4f9e48eb95def7454770c980` | `20be92ff904e45a1a270f8cd02d050bc` | healthy | none | yes |
| Invalid start (10:00 vocal) | — | 6 | — | — | healthy | none | blocked (`Start time is past the end of this file.`; no mix, no false Done) |
| MP3 optional | 0:00 / 0:00 | 115 | `8e28d97190114a4895518c348bacc15e` | `5fd711fb11634ef6b14e4821b4959056` | healthy | none | yes |
| Sidecar during processing | 0:30 / 0:00 | 115 | `b03f74cdd3224f8fa83d01f7cc2c8ccf` | `81955c09d5ff4eb79d2ffec299c634c1` | **22× `/health` OK** | none | yes |

Evidence JSON: `qa/full-local-workflow/phase-41/quick-mix-section-browser-qa.json` (`npm run smoke:quick-mix:section-qa` with `MASHLAB_QM_VOCAL` / `MASHLAB_QM_BEAT`). Browser smoke (real audio): `qa/full-local-workflow/phase-40/quick-mix-real-audio-browser-log.json` — **110 s**, `uiChecksPass: true`, console errors **0**.

**Operator notes:** Use ~3-minute sources for section validation; very long files make “invalid start” cases harder to trigger. Custom-start **Mix** stays disabled until browser duration metadata is available (`sectionDurationsReady` in `QuickMixApp`).

## Remaining limitations

- Still **180 seconds per source**, not full songs  
- Section selection is time-based, not beat/bar or lyric-aware  
- Unknown duration + custom start blocked client-side until metadata available  
- CPU Demucs remains slow; long-running step heartbeats unchanged  
- MP3 remains optional reference export  

## Related docs

- [QUICK_MIX_MODE.md](./QUICK_MIX_MODE.md)  
- [MVP_RELEASE_CANDIDATE_CHECKLIST.md](./MVP_RELEASE_CANDIDATE_CHECKLIST.md)  
- [PHASE_40_TRUE_PEAK_SAFETY.md](./PHASE_40_TRUE_PEAK_SAFETY.md)
