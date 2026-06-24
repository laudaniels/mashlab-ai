# Local Engine Scaffolding

This folder holds local-side tooling that the browser app cannot run directly.

## Current Scripts

- `check-binaries.mts` — detects `ffmpeg` and `ffprobe` on `PATH` and prints setup guidance.

Run from repo root:

```bash
npm run check:local-engine
```

## Future Layout

```text
local-engine/
  check-binaries.mts
  service/          # Python or Rust worker (future)
  artifacts/        # gitignored local job workspace (future)
```

The browser MVP does not require FFmpeg. The local service will.

## Setup Guidance

If binaries are missing:

- **Windows:** install FFmpeg and add it to `PATH`
- **macOS:** `brew install ffmpeg`
- **Linux:** install `ffmpeg` from your distro packages

No copyrighted audio samples are bundled with this project.
