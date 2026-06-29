import type { ServiceCapability } from "../lib/localEngine/types.ts";
import {
  demucsCapabilitySummary,
  findCapability,
  isDemucsAvailable,
  isFfmpegAvailable,
  isRubberBandAvailable,
  rubberBandCapabilitySummary,
} from "../lib/localEngine/capabilities.ts";

export const DEPENDENCY_SETUP_DOCS_HINT =
  "See docs/QA_WORKFLOW_CHECKLIST.md and docs/LOCAL_ENGINE_SERVICE.md for PATH setup.";

export interface DependencyHealthItem {
  id: string;
  label: string;
  status: "online" | "available" | "missing" | "optional" | "planned" | "offline";
  message: string;
  setupGuidance: string | null;
}

export function buildDependencyHealth(
  sidecarOnline: boolean,
  capabilities: ServiceCapability[]
): DependencyHealthItem[] {
  if (!sidecarOnline) {
    return [
      {
        id: "sidecar",
        label: "Python sidecar",
        status: "offline",
        message: "Local helper service offline — browser-only mode.",
        setupGuidance:
          "Start the sidecar: cd local-engine/service && python -m uvicorn main:app --host 127.0.0.1 --port 47831",
      },
      {
        id: "python",
        label: "Python runtime",
        status: "offline",
        message: "Not reachable until the sidecar is running.",
        setupGuidance: "Install Python 3.12+ and add it to PATH. Verify with python --version.",
      },
      {
        id: "ffmpeg",
        label: "FFmpeg / ffprobe",
        status: "offline",
        message: "Cannot verify while sidecar is offline.",
        setupGuidance: "Install FFmpeg and add ffmpeg + ffprobe to PATH. Run npm run check:local-engine.",
      },
    ];
  }

  const python = findCapability(capabilities, "python");
  const ffmpeg = findCapability(capabilities, "ffmpeg");
  const ffprobe = findCapability(capabilities, "ffprobe");
  const librosa = findCapability(capabilities, "librosa");
  const rubberBand = rubberBandCapabilitySummary(capabilities);
  const demucs = demucsCapabilitySummary(capabilities);
  const torch = findCapability(capabilities, "torch");

  return [
    mapSidecarItem(),
    mapCapabilityItem(python, "python", "Python runtime", {
      available: "Sidecar is running.",
      missing: "Python runtime not reported.",
    }),
    mapBinaryPair(ffmpeg, ffprobe),
    mapRubberBandItem(rubberBand),
    mapDemucsItem(demucs, torch),
    mapOptionalPackage(librosa, "librosa", "librosa BPM/key analysis"),
    mapOptionalPackage(findCapability(capabilities, "essentia"), "essentia", "Essentia (planned upgrade)"),
  ];
}

function mapSidecarItem(): DependencyHealthItem {
  return {
    id: "sidecar",
    label: "Python sidecar",
    status: "online",
    message: "Local helper service reachable at 127.0.0.1:47831.",
    setupGuidance: null,
  };
}

function mapCapabilityItem(
  capability: ServiceCapability | undefined,
  id: string,
  label: string,
  messages: { available: string; missing: string }
): DependencyHealthItem {
  if (!capability) {
    return {
      id,
      label,
      status: "missing",
      message: messages.missing,
      setupGuidance: null,
    };
  }

  return {
    id,
    label,
    status: capability.status === "available" ? "available" : capability.status === "planned" ? "planned" : "missing",
    message: capability.message,
    setupGuidance: capability.status === "available" ? null : DEPENDENCY_SETUP_DOCS_HINT,
  };
}

function mapBinaryPair(
  ffmpeg: ServiceCapability | undefined,
  ffprobe: ServiceCapability | undefined
): DependencyHealthItem {
  const ffmpegOk = ffmpeg?.status === "available";
  const ffprobeOk = ffprobe?.status === "available";

  if (ffmpegOk && ffprobeOk) {
    return {
      id: "ffmpeg",
      label: "FFmpeg / ffprobe",
      status: "available",
      message: "FFmpeg and ffprobe found on PATH.",
      setupGuidance: null,
    };
  }

  const missing: string[] = [];
  if (!ffmpegOk) {
    missing.push("ffmpeg");
  }
  if (!ffprobeOk) {
    missing.push("ffprobe");
  }

  return {
    id: "ffmpeg",
    label: "FFmpeg / ffprobe",
    status: "missing",
    message: `${missing.join(" and ")} missing from PATH — required for mix, export, and loudness readout.`,
    setupGuidance:
      "Install FFmpeg and add its bin directory to PATH. Verify with npm run check:local-engine.",
  };
}

function mapRubberBandItem(summary: ReturnType<typeof rubberBandCapabilitySummary>): DependencyHealthItem {
  return {
    id: "rubberband",
    label: "Rubber Band CLI",
    status: summary.status === "available" ? "available" : "missing",
    message:
      summary.status === "available"
        ? summary.message
        : "Rubber Band CLI missing — pitch/time and combined preview processing blocked.",
    setupGuidance:
      summary.status === "available"
        ? null
        : "Install rubberband-cli and ensure rubberband or rubberband.exe is on PATH.",
  };
}

function mapDemucsItem(
  summary: ReturnType<typeof demucsCapabilitySummary>,
  torch: ServiceCapability | undefined
): DependencyHealthItem {
  const demucsCap = summary.status === "available";

  return {
    id: "demucs",
    label: "Demucs / PyTorch",
    status: demucsCap ? "available" : "missing",
    message: summary.message,
    setupGuidance: demucsCap
      ? null
      : torch?.status === "available"
        ? "pip install demucs inside the service virtualenv."
        : "pip install torch and demucs inside the service virtualenv.",
  };
}

function mapOptionalPackage(
  capability: ServiceCapability | undefined,
  id: string,
  label: string
): DependencyHealthItem {
  if (!capability) {
    return {
      id,
      label,
      status: "optional",
      message: `${label} status unknown.`,
      setupGuidance: null,
    };
  }

  if (capability.status === "planned") {
    return {
      id,
      label,
      status: "planned",
      message: capability.message,
      setupGuidance: null,
    };
  }

  return {
    id,
    label,
    status: capability.status === "available" ? "available" : "optional",
    message: capability.message,
    setupGuidance:
      capability.status === "available"
        ? null
        : id === "librosa"
          ? "pip install -r requirements-analysis.txt inside local-engine/service."
          : null,
  };
}

export function formatDependencyHealthSummary(items: DependencyHealthItem[]): string {
  const available = items.filter((item) => item.status === "online" || item.status === "available").length;
  return `${available}/${items.length} dependency checks OK`;
}

export function collectMissingSetupGuidance(items: DependencyHealthItem[]): string[] {
  return items
    .map((item) => item.setupGuidance)
    .filter((guidance): guidance is string => Boolean(guidance));
}

export function sidecarSupportsProcessing(capabilities: ServiceCapability[]): boolean {
  return isFfmpegAvailable(capabilities) && isRubberBandAvailable(capabilities);
}

export function sidecarSupportsStemPreview(capabilities: ServiceCapability[]): boolean {
  return isDemucsAvailable(capabilities) && isFfmpegAvailable(capabilities);
}
