#!/usr/bin/env node
/** Print Windows runtime setup guide. */
import {
  buildLocalStartChecklist,
  LOCAL_ONLY_PROCESSING_NOTICE,
  STREAMLABS_FFMPEG_NOTE,
  WINDOWS_FFMPEG_PATH_NOTICE,
  WINDOWS_PYTHON_PATH_NOTICE,
} from "../src/domain/windowsRuntimeSetup.ts";
import { WSL_OPTIONAL_RHYTHM_NOTICE, WINDOWS_MVP_RHYTHM_NOTICE } from "../src/domain/wslSidecarProfile.ts";

console.log("MashLab AI — Windows runtime setup guide");
console.log("========================================");
console.log("");
console.log(WINDOWS_MVP_RHYTHM_NOTICE);
console.log(WSL_OPTIONAL_RHYTHM_NOTICE);
console.log(LOCAL_ONLY_PROCESSING_NOTICE);
console.log("");
console.log("## Required on PATH for processing");
console.log(WINDOWS_PYTHON_PATH_NOTICE);
console.log(WINDOWS_FFMPEG_PATH_NOTICE);
console.log("");
console.log("## Optional sidecar packages (inside local-engine/service venv)");
console.log("- requirements-analysis.txt — librosa BPM/key prototype");
console.log("- requirements-stems.txt — Demucs + PyTorch stem preview");
console.log("- Rubber Band CLI — pitch/time and combined preview");
console.log("");
console.log("## Verify installation");
console.log("npm run setup:windows:check");
console.log("npm run check:local-engine");
console.log("npm run sidecar:wsl:check   (optional WSL rhythm lane)");
console.log("");
console.log(STREAMLABS_FFMPEG_NOTE);
console.log("");
console.log("## Start MashLab locally");
for (const line of buildLocalStartChecklist()) {
  console.log(line);
}
console.log("");
console.log("Full doc: docs/WINDOWS_RUNTIME_SETUP.md");
