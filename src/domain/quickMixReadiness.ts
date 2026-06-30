import type { ServiceCapability } from "../lib/localEngine/types.ts";
import {
  findCapability,
  isDemucsAvailable,
  isFfmpegAvailable,
  isRubberBandAvailable,
} from "../lib/localEngine/capabilities.ts";

export type QuickMixReadinessStatus = "ready" | "setup_needed";

export interface QuickMixReadinessItem {
  id: "sidecar" | "ffmpeg" | "rubberband" | "demucs";
  label: string;
  ready: boolean;
  setupHint: string;
}

export interface QuickMixReadinessSummary {
  status: QuickMixReadinessStatus;
  headline: string;
  items: QuickMixReadinessItem[];
}

export function buildQuickMixReadiness(params: {
  sidecarOnline: boolean;
  capabilities: ServiceCapability[];
}): QuickMixReadinessSummary {
  const ffmpegOk = params.sidecarOnline && isFfmpegAvailable(params.capabilities);
  const rubberBandOk = params.sidecarOnline && isRubberBandAvailable(params.capabilities);
  const demucsOk = params.sidecarOnline && isDemucsAvailable(params.capabilities);

  const items: QuickMixReadinessItem[] = [
    {
      id: "sidecar",
      label: "Local engine running",
      ready: params.sidecarOnline,
      setupHint: "Start the local engine: npm run sidecar:start",
    },
    {
      id: "ffmpeg",
      label: "FFmpeg installed",
      ready: ffmpegOk,
      setupHint: "Install FFmpeg and add ffmpeg + ffprobe to PATH.",
    },
    {
      id: "rubberband",
      label: "Rubber Band installed",
      ready: rubberBandOk,
      setupHint: "Install Rubber Band CLI to adjust pitch/time.",
    },
    {
      id: "demucs",
      label: "Demucs / PyTorch installed",
      ready: demucsOk,
      setupHint: "Install Demucs/PyTorch in the sidecar venv to separate stems.",
    },
  ];

  const ready = items.every((item) => item.ready);
  return {
    status: ready ? "ready" : "setup_needed",
    headline: ready ? "Ready to mix" : "Setup needed",
    items,
  };
}

export function isQuickMixReady(summary: QuickMixReadinessSummary): boolean {
  return summary.status === "ready";
}

export function formatQuickMixReadinessLine(item: QuickMixReadinessItem): string {
  const tag = item.ready ? "OK" : "NEEDED";
  return `[${tag}] ${item.label}`;
}

export function librosaAvailableForQuickMix(capabilities: ServiceCapability[]): boolean {
  const librosa = findCapability(capabilities, "librosa");
  return librosa?.status === "available";
}
