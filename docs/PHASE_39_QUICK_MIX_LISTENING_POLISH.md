# Phase 39 — Quick Mix Listening-Test Polish

**Product:** MashLab AI / CyphaBlend AI  
**Branch:** `polish/quick-mix-listening-test`  
**Base:** `fe5f58c` (Quick Mix real-audio RC2)

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

**Legal scope:** Local-only processing tool. No public sharing, cloud upload, downloader features, streaming integrations, or publishing-rights claims. Commercial source filenames are **redacted** below as Track A / Track B and are not committed.

---

## 1. Baseline mix settings (RC2)

| Setting | Value |
|---------|-------|
| Vocal gain | 0 dB |
| Instrumental / bed gain | 0 dB |
| Master trim | 0 dB |
| Limiter safety | on |
| Clipping guard | on |
| Bed duck under vocal | off |
| Fades | none |

Source: `QUICK_MIX_RC2_BASELINE_MIX_SETTINGS` in `src/domain/quickMixListening.ts`

---

## 2. Phase 39 listening profile (new Quick Mix defaults)

| Setting | Value | Rationale |
|---------|-------|-----------|
| Vocal gain | +1.5 dB | Vocal slightly forward for acapella-over-beat clarity |
| Instrumental / bed gain | −3.0 dB | Bed tucked so vocal sits on top |
| Master trim | −0.5 dB | Small headroom before limiter |
| Limiter safety | on | Conservative FFmpeg alimiter prototype |
| Clipping guard | on | ~−1 dBTP ceiling prototype |
| Bed duck under vocal | on | Light `sidechaincompress` (ratio 2.5) |
| Fades | none | Keep MVP flow simple |

Source: `QUICK_MIX_DEFAULT_MIX_SETTINGS` in `src/domain/quickMix.ts`

**Advanced Studio unchanged:** `NEUTRAL_MIX_SETTINGS` remains neutral (0 dB gains, no duck unless user enables).

---

## 3. Synthetic smoke (`npm run smoke:quick-mix`)

**Result: PASS**

| Field | Value |
|-------|-------|
| WAV artifact | `09cd2003c1634f9389b6ead3a9566bc4` |
| MP3 artifact | `25bd76e5b7e4414dbd98c56a7e701c5b` |
| Integrated LUFS | −28.05 |
| True peak | −26.03 dBTP |
| Duck applied | yes |
| Limiter / clip guard | yes |

Log: `qa/full-local-workflow/phase-39/quick-mix-smoke-log.json`

---

## 4. Browser smoke (`npm run smoke:quick-mix:browser`)

### 4a. Synthetic (15 s generated audio)

**Result: PASS** — headless Edge (Playwright).

| Check | Result |
|-------|--------|
| Quick Mix completed | yes |
| WAV / MP3 download visible | yes |
| Phase 39 mix profile visible | yes |
| Loudness notice / warnings visible | yes |
| RC2 vs Phase 39 comparison list | yes |
| False Done state | no |
| Console / page errors | none |
| Total time | ~25 s |

Evidence: `qa/full-local-workflow/phase-39/quick-mix-browser-smoke-log.json`

### 4b. Real local audio (redacted Track A / Track B)

**Result: PASS** — same harness with env-supplied local files (filenames not logged).

| Check | Result |
|-------|--------|
| Quick Mix completed | yes |
| WAV / MP3 download visible | yes |
| Phase 39 mix profile + loudness copy | yes |
| True peak warning surfaced (1.3 dBTP) | yes — honest, not mastered |
| Heartbeat during Demucs | yes (~0:43 on instrumental step) |
| Total time | 108 s |

Evidence: `qa/full-local-workflow/phase-39/quick-mix-real-audio-browser-log.json`

---

## 5. Local operator listening pass (redacted)

Two real local files from the operator library (names withheld; not committed):

| Label | Role | Format | Duration (approx.) |
|-------|------|--------|---------------------|
| Track A | Vocal / acapella source | MP3 | ~205 s (180 s MVP cap applied) |
| Track B | Instrumental / beat source | MP3 | ~292 s (180 s MVP cap applied) |

A/B exports from the same stem pair via `scripts/quick-mix-listening-operator.mts` (RC2 settings vs Phase 39 settings).

**Result: directionally better with Phase 39 — commit approved.**

| Metric | RC2 baseline | Phase 39 profile |
|--------|--------------|------------------|
| WAV artifact | `c9e1f14d39cb472d84d0f402bbec20a6` | `ad5e5c518d35415684c4f96ea44c9b72` |
| Integrated LUFS | −10.5 | −12.4 |
| True peak | 0.8 dBTP | 1.1 dBTP |
| Duck applied | no | yes |
| Loudness gate | warn (hot + off-target LUFS) | warn (hot true peak) |

### Listening notes (operator, redacted)

| Criterion | RC2 baseline | Phase 39 profile |
|-----------|--------------|------------------|
| Vocal not buried | Bed competed with vocal at 0 dB | Vocal sits clearer forward |
| Bed not overpowering | Bed at full level felt dense | −3 dB + light duck opens space |
| Ducking obvious? | n/a | Subtle — no obvious pumping on this pair |
| Clipping / distortion | Limiters engaged; hot Demucs stems still warn | Similar; warnings surfaced honestly |
| Mastered / club-ready claims | None (correct) | None (correct) |
| Processing completed | yes | yes |

Phase 39 is **directionally better** for Quick Mix’s vocal-over-beat intent. Bed level and duck are not excessively aggressive on this pair. True-peak warnings on hot real stems remain a **known prototype limitation** (conservative limiter + clip guard are on but Demucs preview stems can still measure hot — DJ review required).

Log: `qa/full-local-workflow/phase-39/quick-mix-listening-operator-log.json`

---

## 6. UI / UX additions

- Patience notice while mixing (“Processing may take several minutes…”)
- Output panel: mix profile summary, loudness notice/warnings, RC2 vs Phase 39 comparison
- Long-running stem heartbeat unchanged from Phase 38

---

## 7. Known limitations

- Demucs two-stem preview is heuristic — not studio separation.
- Limiter and clip guard are FFmpeg prototypes — not professional mastering.
- Light bed duck is a sidechaincompress prototype — DJ review required.
- Loudness gate is informational only (−14 LUFS / −1 dBTP targets are general references).
- Hot real stems may still trigger true-peak warnings despite safety toggles.
- 180-second MVP cap still applies to stem preview length.
- WSL advanced rhythm engines optional-missing (6/7 runtime checks).

---

## 8. No distribution features

This phase does **not** add public sharing, cloud upload, downloader integrations, streaming integrations, copyrighted examples in the repo, or any implication that users receive publishing or distribution rights.
