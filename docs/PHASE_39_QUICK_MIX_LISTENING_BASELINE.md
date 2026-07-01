# Phase 39 — Quick Mix Listening-Test Baseline

**Branch:** `polish/quick-mix-listening-test`  
**Base:** `fe5f58c` (Quick Mix real-audio RC2)

## RC2 baseline mix defaults (pre–Phase 39)

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

## Phase 39 listening-test profile

| Setting | Value | Rationale |
|---------|-------|-----------|
| Vocal gain | +1.5 dB | Vocal slightly forward for acapella-over-beat clarity |
| Instrumental / bed gain | −3.0 dB | Bed tucked so vocal sits on top |
| Master trim | −0.5 dB | Small headroom before limiter |
| Limiter safety | on | Conservative FFmpeg alimiter prototype |
| Clipping guard | on | ~−1 dBTP ceiling prototype |
| Bed duck under vocal | on | Light `sidechaincompress` duck (ratio 2.5) |
| Fades | none | Keep MVP simple |

Source: `QUICK_MIX_DEFAULT_MIX_SETTINGS` in `src/domain/quickMix.ts`

## Advanced Studio unchanged

`NEUTRAL_MIX_SETTINGS` and user-controlled mix panels in Advanced Studio remain neutral (0 dB gains, no duck, no limiter unless user enables).

## Output comparison notes

Quick Mix output now shows:

- Mix profile summary (visible)
- RC2 baseline vs Phase 39 profile (visible comparison list)
- Loudness readout / warnings when sidecar measures LUFS + true peak
- Technical details (collapsed) with artifact ids and full notes

## Legal

Local-only processing. No publishing rights implied. User responsible for rights and clearances.
