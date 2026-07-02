import { LOCAL_ONLY_PROCESSING_NOTICE } from "./windowsRuntimeSetup.ts";

/** Phase 44 — Windows desktop packaging approach (Electron portable folder). */
export const DESKTOP_PACKAGING_APPROACH = "electron-portable" as const;

export const DESKTOP_UI_HOST = "127.0.0.1";
export const DESKTOP_UI_PORT = 47830;
export const DESKTOP_UI_URL = `http://${DESKTOP_UI_HOST}:${DESKTOP_UI_PORT}/`;

export const DESKTOP_APP_FOLDER_NAME = "mashlab-app";
export const DESKTOP_PRODUCT_NAME = "MashLab AI";
export const DESKTOP_PORTABLE_EXE_NAME = "MashLabAI-Portable.exe";

export const DESKTOP_BUILD_OUTPUT_DIR = "build/windows-desktop";
export const DESKTOP_UNPACKED_DIR = `${DESKTOP_BUILD_OUTPUT_DIR}/win-unpacked`;
export const DESKTOP_PORTABLE_ZIP = `${DESKTOP_BUILD_OUTPUT_DIR}/MashLabAI-Windows-Portable.zip`;

export const DESKTOP_VENV_RELATIVE = "local-engine/service/.venv/Scripts/python.exe";
export const DESKTOP_SERVICE_RELATIVE = "local-engine/service";
export const DESKTOP_DIST_RELATIVE = "dist";

export interface DesktopRuntimeProbe {
  venvPythonExists: boolean;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  rubberBandAvailable: boolean;
  sidecarHealthy: boolean;
  torchAvailable: boolean;
  demucsAvailable: boolean;
}

export interface DesktopRuntimeCheck {
  id: string;
  label: string;
  pass: boolean;
  blocking: boolean;
  message: string;
  setupGuidance: string | null;
}

export interface DesktopRuntimeEvaluation {
  checks: DesktopRuntimeCheck[];
  canLaunchUi: boolean;
  canProcessAudio: boolean;
  guidanceLines: string[];
}

export const DESKTOP_VENV_SETUP_GUIDANCE =
  "Open PowerShell in the MashLab app folder and run: cd local-engine\\service && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt";

export const DESKTOP_FFMPEG_SETUP_GUIDANCE =
  "Install FFmpeg for Windows, add its bin folder to PATH, then restart MashLab AI. See docs/WINDOWS_RUNTIME_SETUP.md";

export const DESKTOP_RUBBERBAND_SETUP_GUIDANCE =
  "Download the Breakfast Quay Rubber Band Windows CLI zip, extract rubberband.exe and sndfile.dll to one folder, and add that folder to PATH.";

export const DESKTOP_DEMUCS_SETUP_GUIDANCE =
  "In local-engine\\service with the venv active: pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements-stems.txt";

export function resolvePackagedAppRoot(input: {
  execPath: string;
  resourcesPath: string;
  isPackaged: boolean;
  devRoot: string;
}): string {
  if (!input.isPackaged) {
    return input.devRoot;
  }
  const { dirname, join } = pathFrom(input.execPath);
  return join(dirname(input.execPath), DESKTOP_APP_FOLDER_NAME);
}

/** Minimal path helpers so this module stays Node-free for browser imports. */
function pathFrom(_execPath: string): {
  dirname: (value: string) => string;
  join: (...parts: string[]) => string;
} {
  return {
    dirname: (value: string) => {
      const parts = value.replace(/\\/g, "/").split("/");
      parts.pop();
      return parts.join("/") || ".";
    },
    join: (...parts: string[]) => parts.filter(Boolean).join("/").replace(/\/+/g, "/"),
  };
}

export function resolveDesktopDistDir(appRoot: string): string {
  return `${appRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${DESKTOP_DIST_RELATIVE}`;
}

export function resolveDesktopServiceDir(appRoot: string): string {
  return `${appRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${DESKTOP_SERVICE_RELATIVE}`;
}

export function resolveDesktopVenvPython(appRoot: string): string {
  return `${appRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${DESKTOP_VENV_RELATIVE}`;
}

export function evaluateDesktopRuntimeChecks(probe: DesktopRuntimeProbe): DesktopRuntimeEvaluation {
  const checks: DesktopRuntimeCheck[] = [
    {
      id: "ui",
      label: "Desktop shell",
      pass: true,
      blocking: false,
      message: "Electron window and local static UI server are bundled with the portable app.",
      setupGuidance: null,
    },
    {
      id: "venv",
      label: "Python sidecar venv",
      pass: probe.venvPythonExists,
      blocking: true,
      message: probe.venvPythonExists
        ? "local-engine/service/.venv python found beside the app."
        : "Sidecar venv missing — Quick Mix processing cannot start.",
      setupGuidance: probe.venvPythonExists ? null : DESKTOP_VENV_SETUP_GUIDANCE,
    },
    {
      id: "ffmpeg",
      label: "FFmpeg / ffprobe",
      pass: probe.ffmpegAvailable && probe.ffprobeAvailable,
      blocking: true,
      message:
        probe.ffmpegAvailable && probe.ffprobeAvailable
          ? "ffmpeg and ffprobe detected on PATH."
          : `Missing: ${[!probe.ffmpegAvailable ? "ffmpeg" : null, !probe.ffprobeAvailable ? "ffprobe" : null]
              .filter(Boolean)
              .join(", ")}`,
      setupGuidance:
        probe.ffmpegAvailable && probe.ffprobeAvailable ? null : DESKTOP_FFMPEG_SETUP_GUIDANCE,
    },
    {
      id: "rubberband",
      label: "Rubber Band CLI",
      pass: probe.rubberBandAvailable,
      blocking: false,
      message: probe.rubberBandAvailable
        ? "Rubber Band CLI detected on PATH."
        : "Rubber Band missing — pitch/time stretch and some export paths may be limited.",
      setupGuidance: probe.rubberBandAvailable ? null : DESKTOP_RUBBERBAND_SETUP_GUIDANCE,
    },
    {
      id: "sidecar",
      label: "Python sidecar",
      pass: probe.sidecarHealthy,
      blocking: false,
      message: probe.sidecarHealthy
        ? "Sidecar healthy at 127.0.0.1:47831."
        : "Sidecar not healthy yet — MashLab will try to start it on launch.",
      setupGuidance: null,
    },
    {
      id: "demucs",
      label: "Demucs / PyTorch",
      pass: probe.torchAvailable && probe.demucsAvailable,
      blocking: false,
      message:
        probe.torchAvailable && probe.demucsAvailable
          ? "Demucs and PyTorch importable in the sidecar venv."
          : "Demucs or PyTorch missing — stem preview lane blocked; Quick Mix may still run on uploaded sources.",
      setupGuidance:
        probe.torchAvailable && probe.demucsAvailable ? null : DESKTOP_DEMUCS_SETUP_GUIDANCE,
    },
  ];

  const canLaunchUi = true;
  const canProcessAudio =
    probe.venvPythonExists && probe.ffmpegAvailable && probe.ffprobeAvailable && probe.sidecarHealthy;

  const guidanceLines = [
    LOCAL_ONLY_PROCESSING_NOTICE,
    ...checks
      .filter((check) => !check.pass && check.setupGuidance)
      .map((check) => `${check.label}: ${check.setupGuidance}`),
  ];

  return { checks, canLaunchUi, canProcessAudio, guidanceLines };
}

export function formatDesktopRuntimeCheckLine(check: DesktopRuntimeCheck): string {
  const tag = check.pass ? "OK" : check.blocking ? "BLOCKED" : "WARN";
  return `[${tag}] ${check.label} — ${check.message}`;
}

export function buildDesktopLaunchBanner(appUrl: string): string[] {
  return [
    `${DESKTOP_PRODUCT_NAME} — Windows desktop`,
    `UI:      ${appUrl}`,
    "Sidecar: http://127.0.0.1:47831",
    LOCAL_ONLY_PROCESSING_NOTICE,
  ];
}

export function buildDesktopSetupSteps(): string[] {
  return [
    "1. Unzip MashLabAI-Windows-Portable.zip to a folder you can write to (Documents or Desktop).",
    "2. Double-click MashLab AI.exe (or MashLabAI-Portable.exe if using the single-file build).",
    "3. First launch: create the sidecar venv beside the app if prompted.",
    "4. Ensure FFmpeg, ffprobe, and Rubber Band are on PATH (see docs/WINDOWS_RUNTIME_SETUP.md).",
    "5. Optional stems lane: install Demucs/PyTorch in the sidecar venv.",
    "6. Use Quick Mix — section picker, Remix Brain, and Arrangement Brain styles are unchanged.",
    LOCAL_ONLY_PROCESSING_NOTICE,
  ];
}

export function includesDesktopLocalOnlyLanguage(text: string): boolean {
  return /local-only|no cloud upload|no public sharing|rights-neutral/i.test(text);
}
