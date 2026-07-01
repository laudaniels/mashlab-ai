import type { SlotId } from "./types.ts";

export const STEM_PREVIEW_ONLY_NOTICE =
  "Preview only — not studio-quality stem separation, final mashup, or export. DJ review required.";

export const STEM_PROCESSED_LABEL = "Processed stem preview — heuristic Demucs output.";

export type StemSplitMode = "vocals_no_vocals";

export interface StemPreviewRequestParams {
  splitMode: StemSplitMode;
  maxPreviewSeconds: number;
  previewStartSeconds?: number;
  trackSlotId: SlotId;
  fileName: string;
}

export interface StemArtifactSummary {
  fileName: string;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  artifactUrl: string;
  playbackUrl: string | null;
}

export interface StemPreviewInputSummary {
  fileName: string;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  splitMode: string;
  maxPreviewSeconds: number | null;
  previewStartSeconds?: number | null;
}

export interface StemPreviewResult {
  ok: boolean;
  status: string;
  message: string;
  method: string | null;
  audioProcessed: boolean;
  artifactId: string | null;
  inputSummary: StemPreviewInputSummary | null;
  vocals: StemArtifactSummary | null;
  noVocals: StemArtifactSummary | null;
  warnings: string[];
  limitations: string[];
  setupGuidance: string | null;
  validationErrors: string[];
  isPreviewOnly: true;
}

export function isStemPreviewReady(params: {
  sidecarOnline: boolean;
  demucsAvailable: boolean;
  trackFile: File | null;
}): { ready: boolean; reason: string } {
  if (!params.sidecarOnline) {
    return { ready: false, reason: "Local sidecar offline." };
  }

  if (!params.demucsAvailable) {
    return {
      ready: false,
      reason: "Demucs and PyTorch are not available in the local sidecar environment.",
    };
  }

  if (!params.trackFile) {
    return { ready: false, reason: "Upload a track before creating a stem preview." };
  }

  return { ready: true, reason: "Ready for user-initiated stem preview separation." };
}

export function buildStemPreviewRequestParams(
  trackSlotId: SlotId,
  file: File
): StemPreviewRequestParams {
  return {
    splitMode: "vocals_no_vocals",
    maxPreviewSeconds: 60,
    trackSlotId,
    fileName: file.name,
  };
}

export function stemPreviewClaimsStudioQuality(result: StemPreviewResult): boolean {
  const haystack = [result.message, ...result.limitations, ...result.warnings].join(" ").toLowerCase();
  return haystack.includes("studio-quality") && !haystack.includes("not studio-quality");
}

export function formatStemPreviewStatusMessage(result: StemPreviewResult): string {
  if (!result.ok) {
    return result.message;
  }

  return `${STEM_PROCESSED_LABEL} ${result.message}`;
}
