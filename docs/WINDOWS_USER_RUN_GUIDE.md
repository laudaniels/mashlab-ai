# MashLab AI — Windows User Run Guide

Use this guide to run MashLab AI from the **Windows desktop build** without Cursor or npm.

## What you need

1. **MashLabAI-Windows-Portable.zip** (or the `win-unpacked` folder from a developer build)
2. A writable folder (Documents, Desktop, or `C:\MashLab`)
3. **Python 3.10+** installed on Windows
4. **FFmpeg** and **ffprobe** on PATH
5. **Rubber Band CLI** on PATH (recommended for best Quick Mix results)

Optional: **Demucs + PyTorch** in the sidecar venv for stem preview.

## Install (first time)

1. Unzip `MashLabAI-Windows-Portable.zip` to your chosen folder.
2. Open the folder — you should see **`MashLab AI.exe`** and a **`mashlab-app`** subfolder.
3. Create the Python sidecar environment (one time):

```powershell
cd mashlab-app\local-engine\service
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

4. Add FFmpeg and Rubber Band to PATH (see [WINDOWS_RUNTIME_SETUP.md](./WINDOWS_RUNTIME_SETUP.md)).

5. Optional stems lane:

```powershell
cd mashlab-app\local-engine\service
.\.venv\Scripts\pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip install -r requirements-stems.txt
```

## Launch

**Double-click `MashLab AI.exe`.**

MashLab will:

1. Check FFmpeg, Python venv, Rubber Band, and Demucs
2. Show setup guidance if anything is missing
3. Start the local UI at `http://127.0.0.1:47830`
4. Start the Python sidecar at `http://127.0.0.1:47831`
5. Open the MashLab window

No terminal window is required.

## Using Quick Mix

1. Upload **Track A** and **Track B** (audio you own or are authorized to use).
2. Pick sections with the **section picker** (RC4).
3. Choose an **Arrangement Brain** style:
   - **Clean Blend** — RC6 Remix Brain path
   - **Hook Remix** — intro → hook → outro
   - **DJ Edit** — intro → hook → break → hook → outro
4. Click **Mix**.
5. Review the arrangement card (confidence, warnings).
6. Download **WAV** (primary) or **MP3** (secondary).

## Exit

Close the MashLab window. The app stops the sidecar it started and shuts down cleanly.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Setup dialog on launch | Follow venv / FFmpeg / Rubber Band steps above |
| Quick Mix fails | Confirm sidecar: open `http://127.0.0.1:47831/health` in a browser — should show `"ok": true` |
| MP3 missing | WAV still works; MP3 is secondary and may fail non-blocking |
| Slow processing | Normal on CPU — several minutes for real tracks |
| Windows SmartScreen warning | Expected for unsigned portable builds — only run builds you trust |

## Rights and scope

- **Local-only** processing on your machine
- **No** cloud upload, downloader, streaming imports, or public sharing
- **No** publishing or distribution rights implied
- You supply audio and remain responsible for rights

## Developer rebuild

From the repo:

```powershell
npm run build:windows:desktop
```

Output: `build/windows-desktop/win-unpacked/MashLab AI.exe`
