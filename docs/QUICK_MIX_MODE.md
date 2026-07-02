# Quick Mix Mode

**Default MVP experience** — MashLab AI / CyphaBlend AI

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## What Quick Mix is

Quick Mix is the **default landing screen**:

1. **Vocal / acapella source**
2. **Instrumental / beat source**
3. Optional **Section to use** — **First 3:00** (default) or **Custom start**
4. Optional **Style** — **Clean Blend** (default), **Hook Remix**, or **DJ Edit** (Phase 43)
5. One **Mix** button

Optional under each source: **Section to use** — **First 3:00** (default) or **Custom start** (minutes/seconds). Optional toggle: same start for both sources. See [PHASE_41_QUICK_MIX_SECTION_PICKER.md](./PHASE_41_QUICK_MIX_SECTION_PICKER.md).

**Style (Phase 43):** default **Clean Blend** = RC6 Remix Brain. **Hook Remix** = hook-focused phrase section. **DJ Edit** = intro → hook → break → hook → outro on bar boundaries. See [PHASE_43_ARRANGEMENT_BRAIN.md](./PHASE_43_ARRANGEMENT_BRAIN.md).

The app runs the full local pipeline when the user clicks **Mix** (no processing on upload):

1. Validate files + dependencies (sidecar, FFmpeg, Rubber Band, Demucs/PyTorch)
2. Separate vocals from Track A (Demucs)
3. Separate instrumental bed from Track B (Demucs)
4. Match timing/key when librosa is available; otherwise neutral processing
5. Mix with **Phase 40 listening defaults** (vocal forward, bed tucked, light duck, staged limiter)
6. Export **local WAV** + optional **MP3 reference**

Progress: Checking files → Separating vocal → Preparing instrumental → Matching timing/key → Mixing track → Creating WAV export → Creating MP3 reference → Done

**Done** only after WAV succeeds. Long Demucs steps show elapsed time + heartbeat (“has not stopped”).

**180-second cap:** each source processes up to **180 seconds** — default **First 3:00**, or choose a **custom start** (Phase 41). Not a full-length export.

Output: **Local mix export — user responsible for rights.** Not professionally mastered. Not publish-ready.

## Default mix profile (Phase 40)

| Setting | Value |
|---------|-------|
| Vocal | +1.5 dB |
| Bed | −3.0 dB |
| Master | −1.0 dB |
| Limiter + clip guard | on (staged linear ceiling ~−1 dBTP) |
| Bed duck under vocal | on (light) |

Advanced Studio `NEUTRAL_MIX_SETTINGS` unchanged.

## Output panel

- Audio player
- Download WAV / MP3 (MP3 failure is non-blocking if WAV OK)
- Mix profile summary
- **Arrangement Brain card (Phase 43):** style, arrangement summary line, sync/tempo/key, confidence, warnings
- Remix Brain plan card (RC6 — retained under Clean Blend)
- Loudness / true peak warnings when measured
- RC2 vs current profile comparison
- 180 s cap + selected section summary when applicable
- Rights notice
- Open in Advanced Studio / Start another mix
- Technical details collapsed (artifact IDs inside)

## Advanced Studio

Full workflow remains under **Advanced Studio** (analysis, stems, export, package, etc.).

## Legal / product constraints

- Neutral private local audio-processing tool
- User-supplied audio; user holds rights
- **No** public sharing, cloud upload, downloader, or streaming integrations
- **No** copyrighted-song examples in repo/docs/QA

## Commands

```powershell
npm run start:local:windows
npm run sidecar:status
npm run smoke:quick-mix
npm run smoke:quick-mix:browser   # requires npm run dev
npm run smoke:quick-mix:arrangement-brain   # DJ_REMIX_QA_VOCAL + DJ_REMIX_QA_BEAT
```

Real-file browser QA: set `MASHLAB_QM_VOCAL` / `MASHLAB_QM_BEAT` env vars locally (filenames never committed).

## Related docs

- `docs/PHASE_41_QUICK_MIX_SECTION_PICKER.md`
- `docs/PHASE_42_REMIX_BRAIN_DJ_SYNC_ENGINE.md`
- `docs/PHASE_43_ARRANGEMENT_BRAIN.md`
- `docs/PHASE_40_TRUE_PEAK_SAFETY.md`
- `docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md`
- `docs/QA_WORKFLOW_CHECKLIST.md`
