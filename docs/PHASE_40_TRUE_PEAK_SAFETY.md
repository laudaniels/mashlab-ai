# Phase 40 — Quick Mix True-Peak / Limiter Safety Hardening

**Product:** MashLab AI / CyphaBlend AI  
**Branch:** `polish/quick-mix-listening-test`

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

**Legal scope:** Local-only. No public sharing, cloud upload, downloader, streaming, copyrighted examples in repo, or publishing-rights claims.

---

## Problem

Phase 39 improved vocal-over-beat balance, but real-file QA still measured hot true peaks (e.g. Phase 39 ~1.1 dBTP). Root cause: FFmpeg `alimiter=limit=-2.5dB` **did not limit** on this build — linear `limit=0.794:level=disabled` is required.

---

## Final Quick Mix default settings

| Setting | RC2 | Phase 39 | Phase 40 (current) |
|---------|-----|----------|-------------------|
| Vocal | 0 dB | +1.5 dB | **+1.5 dB** |
| Bed | 0 dB | −3.0 dB | **−3.0 dB** |
| Master | 0 dB | −0.5 dB | **−1.0 dB** |
| Limiter safety | on | on | **on (staged)** |
| Clipping guard | on | on | **on (staged)** |
| Bed duck | off | on | **on** |

Source: `QUICK_MIX_DEFAULT_MIX_SETTINGS` in `src/domain/quickMix.ts`

---

## FFmpeg safety chain

1. Mix gains + optional light bed duck (`sidechaincompress`)
2. Master trim (−1.0 dB Quick Mix default)
3. Soft limiter: `alimiter=limit=0.88:level=disabled`
4. Hard ceiling: `alimiter=limit=0.794:level=disabled` (~−1.0 dBTP linear)
5. **Export peak-ceiling pass** after pcm_s16le encode (same linear ceiling)

Not professional mastering. DJ review required.

---

## LUFS / true peak comparison (redacted real-file QA)

Track A (vocal) / Track B (instrumental) — names withheld. 180 s MVP cap.

| Profile | Integrated LUFS | True peak | Loudness gate |
|---------|-----------------|-----------|---------------|
| RC2 baseline | −11.7 | −1.16 dBTP | warn (LUFS off-target) |
| Phase 39 (−0.5 master) | −13.6 | −1.01 dBTP | pass |
| **Phase 40 (current)** | −13.9 | **−1.01 dBTP** | pass |

Phase 40 artifact: `5e3889d051fe42698bfa9d7181c4bd74`

Evidence: `qa/full-local-workflow/phase-40/quick-mix-listening-operator-log.json`

When true peak still exceeds −1 dBTP after prototype processing, warnings include:  
**“True peak warning — review before performance.”**

---

## Synthetic / browser smoke

| Test | Result | Log |
|------|--------|-----|
| API smoke | PASS | `qa/full-local-workflow/phase-40/quick-mix-smoke-log.json` |
| Browser (synthetic) | PASS | `qa/full-local-workflow/phase-40/quick-mix-browser-smoke-log.json` |
| Browser (real-file, redacted) | PASS ~116 s | `qa/full-local-workflow/phase-40/quick-mix-real-audio-browser-log.json` |

Real-file browser: WAV + MP3 downloads, Phase 40 profile visible, heartbeat during Demucs, no console errors.

---

## Known limitations

- Demucs two-stem preview is heuristic — not studio separation
- Prototype limiters are not mastering or club-ready certification
- Loudness gate is informational only (−14 LUFS / −1 dBTP references)
- 180 s MVP stem cap still applies
- WSL advanced rhythm optional-missing (6/7 runtime checks)

---

## No distribution features

No public sharing, cloud upload, downloader, streaming integrations, or publishing-rights implications added.
