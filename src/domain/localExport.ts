import { requiredRightsNotice } from "../lib/legal.ts";
import type { LoudnessReadout } from "./previewArtifacts.ts";

export const LOCAL_EXPORT_ARTIFACT_LABEL =
  "Local export — user responsible for rights. No public distribution rights granted.";

export const EXPORT_WAV_ONLY_NOTICE = "WAV export only in this phase. MP3 is not implemented.";

export const EXPORT_NOT_MASTERED_NOTICE =
  "Local WAV export is copied from a combined preview — not full mastering or club-ready output.";

export const EXPORT_EXTENDED_LIMITATIONS = [
  "MP3, stem package, mastering presets, and public sharing are not implemented.",
  "Export does not grant distribution or publishing rights.",
] as const;

export type LoudnessTargetMode = "measurement_only" | "normalize_preview";

export interface ExportWavRequestParams {
  sourceCombinedPreviewArtifactId: string;
  exportLabel?: string | null;
  loudnessTargetMode: LoudnessTargetMode;
}

export interface ExportWavResult {
  ok: boolean;
  status: string;
  message: string;
  exportArtifactId: string | null;
  sourceCombinedPreviewArtifactId: string | null;
  artifactUrl: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  codec: string | null;
  loudness: LoudnessReadout | null;
  finalExport: boolean;
  publicShare: boolean;
  rightsNotice: string;
  warnings: string[];
  limitations: string[];
  exportLabel: string | null;
  validationErrors: string[] | null;
}

export function validateExportWavRequest(params: ExportWavRequestParams): string[] {
  const errors: string[] = [];

  if (!/^[a-zA-Z0-9]+$/.test(params.sourceCombinedPreviewArtifactId)) {
    errors.push("source_combined_preview_artifact_id must be alphanumeric.");
  }

  if (
    params.loudnessTargetMode !== "measurement_only" &&
    params.loudnessTargetMode !== "normalize_preview"
  ) {
    errors.push("loudness_target_mode must be measurement_only or normalize_preview.");
  }

  if (params.exportLabel && params.exportLabel.trim().length > 120) {
    errors.push("export_label must be 120 characters or fewer.");
  }

  return errors;
}

export function exportResultClaimsFinalExport(result: ExportWavResult): boolean {
  return result.ok && result.finalExport === true;
}

export function exportResultGrantsPublicShare(result: ExportWavResult): boolean {
  return result.publicShare === true;
}

export function formatExportWarnings(result: ExportWavResult): string[] {
  return [...result.warnings, ...result.limitations];
}

export function normalizePreviewModeLabel(mode: LoudnessTargetMode): string {
  if (mode === "normalize_preview") {
    return "Normalize preview copy (prototype — not full mastering)";
  }
  return "Measurement only (default)";
}

export const DEFAULT_EXPORT_RIGHTS_NOTICE = requiredRightsNotice;
