import { requiredRightsNotice } from "../lib/legal.ts";
import type { LoudnessReadout } from "./previewArtifacts.ts";
import type { PreviewArtifactSummary } from "./previewArtifacts.ts";

export const MP3_EXPORT_ARTIFACT_LABEL =
  "Local MP3 reference export — user responsible for rights. No public distribution rights granted.";

export const MP3_REFERENCE_NOTICE =
  "MP3 is a reference/export format, not proof of distribution rights.";

export const MP3_NOT_MASTERED_NOTICE =
  "MP3 is not a mastered club version — use WAV export for primary local reference.";

export const ALLOWED_MP3_BITRATES = [320, 256, 192] as const;
export type Mp3BitrateKbps = (typeof ALLOWED_MP3_BITRATES)[number];

export const DEFAULT_MP3_BITRATE: Mp3BitrateKbps = 320;

export const MP3_EXPORT_SUBTYPE = "mp3";

export interface Mp3ExportRequestParams {
  sourceWavExportArtifactId: string;
  bitrateKbps: Mp3BitrateKbps;
  exportLabel?: string | null;
}

export interface Mp3ExportResult {
  ok: boolean;
  status: string;
  message: string;
  exportArtifactId: string | null;
  sourceWavExportArtifactId: string | null;
  artifactUrl: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  exportFormat: string | null;
  bitrateKbps: number | null;
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
  setupGuidance: string | null;
}

export function validateMp3ExportRequest(params: Mp3ExportRequestParams): string[] {
  const errors: string[] = [];

  if (!/^[a-zA-Z0-9]+$/.test(params.sourceWavExportArtifactId)) {
    errors.push("source_wav_export_artifact_id must be alphanumeric.");
  }

  if (!ALLOWED_MP3_BITRATES.includes(params.bitrateKbps)) {
    errors.push("bitrate_kbps must be 320, 256, or 192.");
  }

  if (params.exportLabel && params.exportLabel.trim().length > 120) {
    errors.push("export_label must be 120 characters or fewer.");
  }

  return errors;
}

export function isAllowedMp3Bitrate(value: number): value is Mp3BitrateKbps {
  return ALLOWED_MP3_BITRATES.includes(value as Mp3BitrateKbps);
}

export function parseMp3Bitrate(value: unknown): Mp3BitrateKbps {
  if (typeof value === "number" && isAllowedMp3Bitrate(value)) {
    return value;
  }
  return DEFAULT_MP3_BITRATE;
}

export function formatMp3Bitrate(bitrateKbps: number | null): string {
  if (bitrateKbps === null || !Number.isFinite(bitrateKbps)) {
    return "—";
  }
  return `${bitrateKbps} kbps`;
}

export function isWavExportArtifact(artifact: PreviewArtifactSummary): boolean {
  return (
    artifact.artifactType === "export" &&
    artifact.exportFormat !== "mp3" &&
    artifact.exportSubtype !== MP3_EXPORT_SUBTYPE &&
    artifact.primaryFileName !== "export.mp3"
  );
}

export function isMp3ExportArtifact(artifact: PreviewArtifactSummary): boolean {
  return (
    artifact.artifactType === "export" &&
    (artifact.exportFormat === "mp3" ||
      artifact.exportSubtype === MP3_EXPORT_SUBTYPE ||
      artifact.primaryFileName === "export.mp3")
  );
}

export function mp3ExportPanelIsLocked(wavExports: PreviewArtifactSummary[]): boolean {
  return wavExports.length === 0;
}

export function mp3ExportResultClaimsFinalExport(result: Mp3ExportResult): boolean {
  return result.ok && result.finalExport === true;
}

export function mp3ExportResultGrantsPublicShare(result: Mp3ExportResult): boolean {
  return result.publicShare === true;
}

export function formatMp3ExportWarnings(result: Mp3ExportResult): string[] {
  return [...result.warnings, ...result.limitations];
}

export function formatExportSubtypeLabel(
  exportSubtype: string | null,
  exportFormat: string | null
): string {
  if (exportFormat === "mp3" || exportSubtype === MP3_EXPORT_SUBTYPE) {
    return "export / mp3";
  }
  if (exportSubtype === "full-wav") {
    return "export / full-wav";
  }
  if (exportSubtype === "preview-copy") {
    return "export / wav";
  }
  if (exportSubtype) {
    return `export / ${exportSubtype}`;
  }
  if (exportFormat === "wav") {
    return "export / wav";
  }
  return "export";
}

export const DEFAULT_MP3_EXPORT_RIGHTS_NOTICE = requiredRightsNotice;
