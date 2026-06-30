# Quick Mix Mode (Phase 36)

**Default MVP experience** — simple front door for MashLab AI / CyphaBlend AI.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## What Quick Mix is

Quick Mix is the **default landing screen**. It asks for:

1. **Vocal / acapella source** — the song you want the vocal from
2. **Instrumental / beat source** — the song you want the beat/instrumental from
3. One **Mix** button

The app runs the existing local pipeline automatically when the user clicks **Mix** (no processing on upload):

1. Validate both files and local dependencies (sidecar, FFmpeg/ffprobe, Rubber Band, Demucs/PyTorch)
2. Separate **vocals.wav** from the vocal source
3. Separate **no_vocals.wav** from the instrumental source
4. Match timing/key when librosa analysis is available, otherwise neutral processing with copy: *No tempo/key correction applied*
5. Mix internally with default 0 dB vocal/instrumental/master gains and safety limiter guards
6. Export a **local WAV**
7. Optionally create an **MP3 reference** (does not block WAV success)

Progress ladder: Checking files → Separating vocal → Preparing instrumental → Matching timing/key → Mixing track → Creating WAV export → Creating MP3 reference → Done

Output label: **Local mix export — user responsible for rights.**

This is **not** professionally mastered and **not** publish-ready.

## Advanced Studio

All existing workflows remain under **Advanced Studio**:

- Analysis, Timeline, Drafts, Stems, Combined Preview, Export, Package
- Local Engine Status, Workflow Readiness, WSL rhythm tooling

Open via **Advanced Studio** from Quick Mix, or **Quick Mix** from the Advanced Studio header.

Mode preference is stored in `localStorage` (`mashlab-app-experience-mode`).

## Dependency handling (Quick Mix)

Quick Mix shows a simple readiness banner:

| Check | User-facing label |
|-------|-------------------|
| Sidecar online | Local engine running |
| FFmpeg | FFmpeg installed |
| Rubber Band | Rubber Band installed |
| Demucs + PyTorch | Demucs / PyTorch installed |

Optional WSL rhythm, madmom, Essentia, and detailed capability rows stay in Advanced Studio only.

## Plain-English errors

Quick Mix maps failures to recovery hints such as:

- Start the local engine
- Install FFmpeg to render the mix
- Install Rubber Band to adjust pitch/time
- Install Demucs/PyTorch to separate stems

No stack traces on the main Quick Mix screen.

## Legal / product constraints

- Neutral private audio-processing tool
- User-supplied audio; user holds rights
- **No** public sharing, cloud upload, downloader, or streaming integrations
- **No** copyrighted-song examples in docs or QA

## Commands

```powershell
npm run start:local:windows
# Open http://127.0.0.1:5173/ — Quick Mix is the default screen
npm run sidecar:status
npm run smoke:quick-mix   # API orchestration smoke (synthetic audio, produces WAV)
```

## Related docs

- `docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md`
- `docs/QA_WORKFLOW_CHECKLIST.md`
- `docs/RELEASE_DEPENDENCIES_WINDOWS.md`
