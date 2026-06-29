import type { ExportWavResult, LoudnessTargetMode } from "../../domain/localExport.ts";
import { DEFAULT_EXPORT_RIGHTS_NOTICE } from "../../domain/localExport.ts";
import type { LoudnessReadout } from "../../domain/previewArtifacts.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parseExportWavResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): ExportWavResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const downloadPath =
    typeof record.download_url === "string"
      ? record.download_url
      : typeof record.artifact_url === "string"
        ? record.artifact_url
        : null;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown export response.",
    exportArtifactId:
      typeof record.export_artifact_id === "string" ? record.export_artifact_id : null,
    sourceCombinedPreviewArtifactId:
      typeof record.source_combined_preview_artifact_id === "string"
        ? record.source_combined_preview_artifact_id
        : null,
    artifactUrl: typeof record.artifact_url === "string" ? record.artifact_url : null,
    downloadUrl: downloadPath,
    playbackUrl: downloadPath ? `${baseUrl}${downloadPath}` : null,
    fileSizeBytes: parseNullableNumber(record.file_size_bytes),
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    codec: typeof record.codec === "string" ? record.codec : null,
    loudness: parseLoudnessReadout(record.loudness),
    finalExport: record.final_export === true,
    publicShare: record.public_share === true,
    rightsNotice:
      typeof record.rights_notice === "string" ? record.rights_notice : DEFAULT_EXPORT_RIGHTS_NOTICE,
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    exportLabel: typeof record.export_label === "string" ? record.export_label : null,
    validationErrors: parseStringArrayOrNull(record.validation_errors),
  };
}

function parseLoudnessReadout(value: unknown): LoudnessReadout | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    integratedLufs: parseNullableNumber(record.integrated_lufs),
    truePeakDbtp: parseNullableNumber(record.true_peak_dbtp),
    peakLevelDb: parseNullableNumber(record.peak_level_db),
    status: typeof record.status === "string" ? record.status : "not_available",
    message: typeof record.message === "string" ? record.message : "Loudness readout unavailable.",
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseStringArray(value);
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function parseLoudnessTargetMode(value: string): LoudnessTargetMode {
  return value === "normalize_preview" ? "normalize_preview" : "measurement_only";
}
