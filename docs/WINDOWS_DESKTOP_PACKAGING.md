# Windows Desktop Packaging (Phase 44)

Baseline: **Arrangement Brain RC7** (`mashlab-arrangement-brain-rc7` @ `774e236`)

## Goal

Make MashLab AI **clickable on Windows** without Cursor, npm, or terminal commands for day-to-day use. The desktop build wraps the existing RC7 Quick Mix stack — no changes to core audio/remix logic.

## Approach chosen

| Option | Decision |
|--------|----------|
| **Electron portable folder** | **Selected** — native window, embedded Node, spawns sidecar, serves built UI |
| Tauri | Deferred — adds Rust toolchain; less reuse of existing Node lifecycle scripts |
| Browser-only portable folder | Fallback documented — still needs manual `npm run dev` |
| Windows installer (MSI/NSIS) | Deferred — portable folder first; installer can follow in a later phase |

### Why Electron

- Reuses the existing **Python sidecar** at `127.0.0.1:47831` without rewriting processing code.
- Serves the **Vite production build** on a fixed loopback port (`127.0.0.1:47830`).
- Provides a **double-click `.exe`** with no visible terminal.
- Keeps **RC4 section picker**, **RC6 Remix Brain**, and **RC7 Arrangement Brain** unchanged.

## Build outputs

| Artifact | Path |
|----------|------|
| Portable folder | `build/windows-desktop/win-unpacked/` |
| Click to launch | `build/windows-desktop/win-unpacked/MashLab AI.exe` |
| Single-file portable (optional) | `build/windows-desktop/MashLabAI-Portable.exe` |
| Zip for distribution | `build/windows-desktop/MashLabAI-Windows-Portable.zip` |

The `mashlab-app/` folder beside the exe contains:

- `dist/` — production UI
- `local-engine/service/` — Python sidecar source (no `.venv`, no `.work`)

Users create the sidecar venv **beside the app** on first setup so PyTorch weights stay local and writable.

## Build commands (developers)

```powershell
npm install
npm run build:windows:desktop
npm run smoke:windows:desktop
```

Individual steps:

| Command | Purpose |
|---------|---------|
| `npm run desktop:check` | Runtime probe (FFmpeg, venv, Rubber Band, Demucs) |
| `npm run desktop:dev` | Launch Electron against repo `dist/` (after `npm run build`) |
| `npm run build:windows:desktop` | Vite build + electron-builder portable package |
| `npm run smoke:windows:desktop` | Verify build artifacts exist |

## Runtime checks on launch

The Electron shell probes:

1. **Python sidecar venv** — `mashlab-app/local-engine/service/.venv`
2. **FFmpeg / ffprobe** — PATH
3. **Rubber Band CLI** — PATH (warn if missing)
4. **Demucs / PyTorch** — sidecar venv imports (warn if missing)
5. **Sidecar health** — `http://127.0.0.1:47831/health`

Missing **blocking** dependencies show a setup dialog with guidance. The UI still opens so upload/planning works; Quick Mix processing needs venv + FFmpeg.

## CORS / ports

| Service | URL |
|---------|-----|
| Desktop UI | `http://127.0.0.1:47830/` |
| Python sidecar | `http://127.0.0.1:47831/` |

`local-engine/service/config.py` allows the desktop UI origin on port **47830**.

## What is not bundled

- Python venv / PyTorch / Demucs weights (too large; user installs once)
- FFmpeg / Rubber Band binaries (user adds to PATH per `WINDOWS_RUNTIME_SETUP.md`)
- Copyrighted audio, commercial filenames, or model weights

## Preserved RC7 scope

- Quick Mix, section picker, Remix Brain, Arrangement Brain (Clean Blend / Hook Remix / DJ Edit)
- WAV primary, MP3 secondary
- Local-only, rights-neutral — no downloader, cloud upload, streaming imports, or public sharing

## Known limitations

- First-time setup still requires Python venv creation beside the portable folder
- CPU processing can take several minutes
- 180-second MVP cap unchanged
- Not code-signed (Windows SmartScreen may warn on first run)
- Installer/auto-update deferred to a later phase

## Related docs

- [WINDOWS_USER_RUN_GUIDE.md](./WINDOWS_USER_RUN_GUIDE.md) — end-user instructions
- [WINDOWS_RUNTIME_SETUP.md](./WINDOWS_RUNTIME_SETUP.md) — FFmpeg, Rubber Band, venv setup
