import { requiredRightsNotice } from "../lib/legal.ts";
import { LOCAL_ONLY_PROCESSING_NOTICE } from "./windowsRuntimeSetup.ts";
import {
  SIDECAR_BIND,
  SIDECAR_CAPABILITIES_URL,
  SIDECAR_HEALTH_URL,
} from "./sidecarLifecycle.ts";

export const APP_DEV_HOST = "127.0.0.1";
export const APP_DEV_PORT = 5173;
export const APP_DEV_URL = `http://${APP_DEV_HOST}:${APP_DEV_PORT}/`;

export interface DemoPreflightCheck {
  id: string;
  label: string;
  pass: boolean;
  message: string;
}

export interface DemoPreflightResult {
  ok: boolean;
  checks: DemoPreflightCheck[];
}

export interface LocalDemoUrls {
  app: string;
  sidecarHealth: string;
  sidecarCapabilities: string;
}

export function buildLocalDemoUrls(): LocalDemoUrls {
  return {
    app: APP_DEV_URL,
    sidecarHealth: SIDECAR_HEALTH_URL,
    sidecarCapabilities: SIDECAR_CAPABILITIES_URL,
  };
}

export function evaluateDemoPreflight(input: {
  venvPythonExists: boolean;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  sidecarHealthy: boolean;
}): DemoPreflightResult {
  const checks: DemoPreflightCheck[] = [
    {
      id: "venv",
      label: "Sidecar venv",
      pass: input.venvPythonExists,
      message: input.venvPythonExists
        ? "local-engine/service/.venv python found"
        : "Create venv: cd local-engine/service && python -m venv .venv && pip install -r requirements.txt",
    },
    {
      id: "ffmpeg",
      label: "FFmpeg",
      pass: input.ffmpegAvailable,
      message: input.ffmpegAvailable ? "ffmpeg on PATH" : "ffmpeg missing — processing/export blocked",
    },
    {
      id: "ffprobe",
      label: "ffprobe",
      pass: input.ffprobeAvailable,
      message: input.ffprobeAvailable ? "ffprobe on PATH" : "ffprobe missing — metadata/export blocked",
    },
    {
      id: "sidecar",
      label: "Sidecar",
      pass: input.sidecarHealthy,
      message: input.sidecarHealthy ? "Sidecar healthy (will skip start if already running)" : "Sidecar will be started",
    },
  ];

  const ok =
    input.venvPythonExists &&
    input.ffmpegAvailable &&
    input.ffprobeAvailable;

  return { ok, checks };
}

export function formatDemoPreflightLine(check: DemoPreflightCheck): string {
  const tag = check.pass ? "OK" : "MISSING";
  return `[${tag}] ${check.label} — ${check.message}`;
}

export function buildDemoStartBanner(): string[] {
  const urls = buildLocalDemoUrls();
  return [
    "MashLab AI / CyphaBlend AI — Windows local demo",
    "",
    `App:          ${urls.app}`,
    `Sidecar:      ${SIDECAR_BIND}`,
    `Health:       ${urls.sidecarHealth}`,
    `Capabilities: ${urls.sidecarCapabilities}`,
    "",
    LOCAL_ONLY_PROCESSING_NOTICE,
    requiredRightsNotice,
  ];
}

export function buildDemoNextSteps(): string[] {
  return [
    "1. Open the app URL in your browser.",
    "2. Upload two tracks you own or are authorized to use (synthetic test WAVs are fine for QA).",
    "3. Follow the session checklist — each processing step is user-initiated only.",
    "4. Verify sidecar: npm run sidecar:status",
    "5. Optional BPM/key: npm run setup:analysis then restart sidecar.",
    "6. Optional WSL rhythm: npm run sidecar:wsl:check (not required on Windows MVP).",
    "7. Capture manual UI screenshots for release docs if needed.",
  ];
}

export function formatLibrosaCapabilityStatus(status: string | undefined, version: string | null): string {
  if (status === "available") {
    return version ? `librosa available (${version})` : "librosa available";
  }
  if (status === "not_configured" || status === "missing" || status === "optional_missing") {
    return "librosa not installed — optional analysis lanes use DJ overrides or npm run setup:analysis";
  }
  return `librosa status: ${status ?? "unknown"}`;
}

export function includesDemoReleaseSafetyLanguage(text: string): boolean {
  return (
    includesNoPublicSharingInDemoCopy(text) &&
    /authorized to use|user's responsibility/i.test(text)
  );
}

export function includesNoPublicSharingInDemoCopy(text: string): boolean {
  return /no public sharing|no cloud upload|not public sharing|local-only|local only/i.test(text);
}
