# Windows Runtime Setup (Phase 28)

MashLab AI / CyphaBlend AI runs as a **browser MVP** on Windows without WSL. Upload, DJ overrides, and arrangement planning work in the browser. Local processing (stems, combined preview, export) needs optional PATH tools and the Python sidecar.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Quick commands

| Command | Purpose |
|---------|---------|
| `npm run setup:windows:check` | Detect Python, FFmpeg, Rubber Band, librosa, Demucs (informational) |
| `npm run setup:windows:check:strict` | Exit 1 if Python or FFmpeg/ffprobe missing |
| `npm run setup:windows:guide` | Print setup guide and start checklist |
| `npm run start:local` | Step-by-step “start MashLab locally” checklist |
| `npm run check:local-engine` | FFmpeg/ffprobe PATH check only |
| `npm run sidecar:wsl:check` | Optional WSL rhythm lane (not required) |

## Dependency tiers

### Browser MVP (no sidecar required)

- Vite app: `npm install && npm run dev`
- Upload two tracks, browser metadata, DJ overrides, arrangement planning
- Works without FFmpeg, Python, or WSL

### Required for local processing / export

| Tool | Used for |
|------|----------|
| **Python 3.10+** on PATH | Run sidecar at `127.0.0.1:47831` |
| **FFmpeg + ffprobe** on PATH | Stem preview, combined preview, export, loudness readout |
| **Rubber Band CLI** on PATH | Pitch/time and combined preview |
| **Demucs + PyTorch** in sidecar venv | Stem preview separation |

Verify PATH tools:

```powershell
npm run setup:windows:check
npm run check:local-engine
```

### Optional analysis prototype

| Package | Used for |
|---------|----------|
| **librosa** in sidecar venv | BPM/key analysis prototype (`requirements-analysis.txt`) |

Heuristic phrase planning remains the default. Verified downbeat labels appear only when real rhythm engines return markers.

### Optional WSL/Linux advanced rhythm

- madmom / Essentia verified downbeats — **not required** on Windows MVP
- See `docs/WSL_RHYTHM_ENGINE_SETUP.md`
- Check: `npm run sidecar:wsl:check`

## Python setup

1. Install [Python 3.10+](https://www.python.org/downloads/) and check **Add python.exe to PATH** during install.
2. Verify: `python --version`
3. Create sidecar venv:

```powershell
cd local-engine\service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-analysis.txt   # optional BPM/key
# optional Demucs stems (Windows CPU):
#   pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
#   pip install -r requirements-stems.txt
python -m uvicorn main:app --host 127.0.0.1 --port 47831
```

## FFmpeg setup

1. Download a standard [FFmpeg release](https://ffmpeg.org/download.html) for Windows (not bundled app copies for permanent setup).

   **When winget/choco/scoop are unavailable**, use the official [BtbN FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases) win64 GPL zip (`ffmpeg-master-latest-win64-gpl.zip`), extract it, and add its inner `bin` folder to PATH.

2. Add the `bin` folder containing `ffmpeg.exe` and `ffprobe.exe` to your user or system PATH.

   Example user PATH entry on this dev host:

   ```text
   C:\Users\<you>\tools\ffmpeg\ffmpeg-master-latest-win64-gpl\bin
   ```

   PowerShell (user PATH, open a new terminal afterward):

   ```powershell
   $bin = "C:\Users\<you>\tools\ffmpeg\ffmpeg-master-latest-win64-gpl\bin"
   [Environment]::SetEnvironmentVariable("Path", "$([Environment]::GetEnvironmentVariable('Path','User'));$bin", "User")
   ```

3. Open a **new** terminal and verify:

```powershell
ffmpeg -version
ffprobe -version
npm run check:local-engine
```

**Temporary verification only:** Streamlabs or other bundled FFmpeg builds may work for a quick test, but install a standard FFmpeg release and add its bin folder to PATH for a permanent setup.

## Rubber Band setup

Required for **pitch/time preview** and combined preview (after stem artifacts exist). Not required for browser MVP upload/planning.

1. Download the official [Rubber Band v4.0.0 Windows command-line utility](https://breakfastquay.com/files/releases/rubberband-4.0.0-gpl-executable-windows.zip) from Breakfast Quay (not bundled app binaries).
2. Extract the zip and keep `rubberband.exe` and `sndfile.dll` in the **same folder**.
3. Add that folder to user PATH.

   Example on this dev host:

   ```text
   C:\Users\<you>\tools\rubberband\rubberband-4.0.0-gpl-executable-windows
   ```

   ```powershell
   $bin = "C:\Users\<you>\tools\rubberband\rubberband-4.0.0-gpl-executable-windows"
   [Environment]::SetEnvironmentVariable("Path", "$([Environment]::GetEnvironmentVariable('Path','User'));$bin", "User")
   ```

4. Open a **new** terminal and verify:

```powershell
rubberband --version
npm run setup:windows:check
```

Restart the Python sidecar after PATH changes so it inherits Rubber Band.

## Demucs + PyTorch setup (stem preview)

Required for **stem preview** (`vocals.wav` + `no_vocals.wav`). Not required for browser MVP upload/planning.

Install inside the sidecar venv — **`npm run setup:windows:check` probes the venv first**, then falls back to default `python`:

```powershell
cd local-engine\service
.\.venv\Scripts\Activate.ps1
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-stems.txt
python -m demucs --help
python -c "import torch; print(torch.__version__)"
```

**CPU vs GPU:** Start with CPU wheels (above) unless you already have a clean CUDA setup. GPU can reduce separation time but is optional.

**First model download:** The first successful stem preview downloads HTDemucs weights (~80 MB) to the user torch hub cache:

```text
%USERPROFILE%\.cache\torch\hub
```

Expect a one-time delay on first run. Weights are **not** committed to git (see `.gitignore` for `.work` and `.cache`).

**Expected processing time (CPU, ~60 s preview clip):** roughly 1–5 minutes depending on hardware — longer on first run while weights download.

**Artifacts:** Stem outputs live under `local-engine/service/.work/artifacts/stems/{uuid}/` (`vocals.wav`, `no_vocals.wav`). Temp trim/Demucs folders under `.work/temp/` are deleted after processing.

Verify:

```powershell
npm run setup:windows:check
curl.exe http://127.0.0.1:47831/v1/capabilities
```

Restart the sidecar after installing Demucs so `/v1/capabilities` reports `demucs` and `torch` as available.

## Start MashLab locally

```powershell
npm run start:local
```

Typical two-terminal flow:

1. **Terminal A:** `npm run dev` → open http://127.0.0.1:5173
2. **Terminal B:** start Python sidecar (see above)
3. Run `npm run setup:windows:check` before processing steps

## Interpreting check failures

| Check | Failure | Meaning |
|-------|---------|---------|
| `setup:windows:check` | Python missing | Sidecar cannot start — browser MVP still works |
| `setup:windows:check` | FFmpeg missing | Processing/export blocked — upload still works |
| `setup:windows:check` | Rubber Band missing | Combined preview / pitch-time blocked |
| `setup:windows:check` | Demucs missing | Stem preview blocked |
| `setup:windows:check` | librosa missing | BPM/key prototype unavailable — overrides still work |
| `setup:windows:check:strict` | exit 1 | Python or FFmpeg/ffprobe not ready for processing CI |
| `check:local-engine` | exit 1 | ffmpeg or ffprobe not on PATH |
| `sidecar:wsl:check` | WSL not installed | Expected on Windows-only hosts — heuristic rhythm remains default |

Do not hide missing FFmpeg — add it to PATH and rerun checks.

## Full quality suite

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:python-service
npm run check:python-service:test
npm run check:local-engine
npm run setup:windows:check
```

## Related docs

- `docs/LOCAL_ENGINE_SERVICE.md` — sidecar endpoints and lanes
- `docs/QA_WORKFLOW_CHECKLIST.md` — manual workflow QA
- `docs/WSL_RHYTHM_ENGINE_SETUP.md` — optional advanced rhythm
- `README.md` — project overview
