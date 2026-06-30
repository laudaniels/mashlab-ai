#!/usr/bin/env node
/** Windows / local runtime PATH checks — informational by default. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  evaluateWindowsCheckExitCode,
  formatWindowsRuntimeCheckLine,
  formatWindowsRuntimeSummary,
  STREAMLABS_FFMPEG_NOTE,
  WINDOWS_FFMPEG_PATH_NOTICE,
  WINDOWS_PYTHON_PATH_NOTICE,
  type WindowsRuntimeCheckItem,
} from "../src/domain/windowsRuntimeSetup.ts";
import { WSL_OPTIONAL_RHYTHM_NOTICE, WINDOWS_MVP_RHYTHM_NOTICE } from "../src/domain/wslSidecarProfile.ts";

const execFileAsync = promisify(execFile);
const strict = process.argv.includes("--strict");

async function commandAvailable(
  command: string,
  args: string[] = ["-version"]
): Promise<{ ok: boolean; detail: string | null }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 8000, shell: process.platform === "win32" });
    const line = `${stdout}\n${stderr}`.split("\n").find((value) => value.trim().length > 0) ?? null;
    return { ok: true, detail: line };
  } catch {
    return { ok: false, detail: null };
  }
}

async function pythonImportAvailable(moduleName: string): Promise<boolean> {
  try {
    await execFileAsync("python", ["-c", `import ${moduleName}`], {
      timeout: 15000,
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

const rubberBandNames =
  process.platform === "win32"
    ? ["rubberband.exe", "rubberband-cli.exe", "rubberband", "rubberband-cli"]
    : ["rubberband", "rubberband-cli"];

async function findRubberBand(): Promise<{ ok: boolean; detail: string | null }> {
  for (const name of rubberBandNames) {
    const result = await commandAvailable(name, ["--version"]);
    if (result.ok) {
      return { ok: true, detail: name };
    }
  }
  return { ok: false, detail: null };
}

const python = await commandAvailable("python", ["--version"]);
const ffmpeg = await commandAvailable("ffmpeg");
const ffprobe = await commandAvailable("ffprobe");
const rubberBand = await findRubberBand();

const librosaOk = python.ok ? await pythonImportAvailable("librosa") : false;
const torchOk = python.ok ? await pythonImportAvailable("torch") : false;
const demucsOk = python.ok ? await pythonImportAvailable("demucs") : false;

const items: WindowsRuntimeCheckItem[] = [
  {
    id: "browser",
    label: "Browser MVP",
    tier: "browser_mvp",
    status: "available",
    message: "Vite app runs with npm run dev — upload and planning work without FFmpeg.",
    setupGuidance: null,
  },
  {
    id: "python",
    label: "Python",
    tier: "processing",
    status: python.ok ? "available" : "missing",
    message: python.ok
      ? `Found: ${python.detail ?? "python"}`
      : "python not found on PATH — sidecar cannot start.",
    setupGuidance: python.ok ? null : WINDOWS_PYTHON_PATH_NOTICE,
  },
  {
    id: "ffmpeg",
    label: "FFmpeg / ffprobe",
    tier: "processing",
    status: ffmpeg.ok && ffprobe.ok ? "available" : "missing",
    message:
      ffmpeg.ok && ffprobe.ok
        ? "ffmpeg and ffprobe found on PATH."
        : `Missing: ${[!ffmpeg.ok ? "ffmpeg" : null, !ffprobe.ok ? "ffprobe" : null].filter(Boolean).join(", ")}`,
    setupGuidance: ffmpeg.ok && ffprobe.ok ? null : WINDOWS_FFMPEG_PATH_NOTICE,
  },
  {
    id: "rubberband",
    label: "Rubber Band CLI",
    tier: "processing",
    status: rubberBand.ok ? "available" : "missing",
    message: rubberBand.ok
      ? `Found: ${rubberBand.detail}`
      : "Rubber Band CLI not on PATH — pitch/time and combined preview blocked.",
    setupGuidance: rubberBand.ok
      ? null
      : "Install rubberband-cli and add rubberband or rubberband.exe to PATH.",
  },
  {
    id: "librosa",
    label: "librosa (Python)",
    tier: "optional_analysis",
    status: !python.ok ? "unknown" : librosaOk ? "available" : "optional_missing",
    message: !python.ok
      ? "Install Python first, then pip install -r requirements-analysis.txt"
      : librosaOk
        ? "librosa importable — BPM/key prototype available."
        : "librosa not installed in default python — install in sidecar venv.",
    setupGuidance: librosaOk ? null : "cd local-engine/service && pip install -r requirements-analysis.txt",
  },
  {
    id: "demucs",
    label: "Demucs / PyTorch",
    tier: "processing",
    status: !python.ok ? "unknown" : demucsOk && torchOk ? "available" : "optional_missing",
    message: !python.ok
      ? "Install Python first."
      : demucsOk && torchOk
        ? "Demucs and PyTorch importable."
        : "Demucs or PyTorch missing — stem preview blocked.",
    setupGuidance:
      demucsOk && torchOk ? null : "pip install -r requirements-stems.txt inside the sidecar venv.",
  },
  {
    id: "wsl",
    label: "WSL advanced rhythm",
    tier: "wsl_optional",
    status: "optional_missing",
    message: "Optional — verified madmom/Essentia lane only. Heuristic phrase planning remains default.",
    setupGuidance: "npm run sidecar:wsl:check — see docs/WSL_RHYTHM_ENGINE_SETUP.md",
  },
];

console.log("MashLab Windows / local runtime check");
console.log(`Mode: ${strict ? "strict" : "informational"}`);
console.log(WINDOWS_MVP_RHYTHM_NOTICE);
console.log(WSL_OPTIONAL_RHYTHM_NOTICE);
console.log("");

for (const item of items) {
  console.log(formatWindowsRuntimeCheckLine(item));
  if (item.setupGuidance) {
    console.log(`  setup: ${item.setupGuidance}`);
  }
}

console.log("");
console.log(formatWindowsRuntimeSummary(items));
console.log(STREAMLABS_FFMPEG_NOTE);
console.log("Docs: docs/WINDOWS_RUNTIME_SETUP.md");

process.exit(evaluateWindowsCheckExitCode(items, strict));
