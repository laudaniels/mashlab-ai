import type { ExportWavResult, LoudnessTargetMode } from "../../domain/localExport.ts";
import { DEFAULT_EXPORT_RIGHTS_NOTICE } from "../../domain/localExport.ts";
import type {
  FullLengthExportResult,
  LoudnessGateDisplay,
} from "../../domain/fullLengthExport.ts";
import { DEFAULT_FULL_EXPORT_RIGHTS_NOTICE } from "../../domain/fullLengthExport.ts";
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

export function parseFullWavExportResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): FullLengthExportResult | null {
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
    message: typeof record.message === "string" ? record.message : "Unknown full export response.",
    exportArtifactId:
      typeof record.export_artifact_id === "string" ? record.export_artifact_id : null,
    artifactUrl: typeof record.artifact_url === "string" ? record.artifact_url : null,
    downloadUrl: downloadPath,
    playbackUrl: downloadPath ? `${baseUrl}${downloadPath}` : null,
    inputSummary: parseFullInputSummary(record.input_summary),
    processingSummary: parseFullProcessingSummary(record.processing_summary),
    fileSizeBytes: parseNullableNumber(record.file_size_bytes),
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    codec: typeof record.codec === "string" ? record.codec : null,
    loudness: parseLoudnessReadout(record.loudness),
    loudnessGate: parseLoudnessGate(record.loudness_gate),
    finalExport: record.final_export === true,
    publicShare: record.public_share === true,
    rightsNotice:
      typeof record.rights_notice === "string"
        ? record.rights_notice
        : DEFAULT_FULL_EXPORT_RIGHTS_NOTICE,
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    exportLabel: typeof record.export_label === "string" ? record.export_label : null,
    validationErrors: parseStringArrayOrNull(record.validation_errors),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
  };
}

function parseFullInputSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.source_vocal_stem_artifact_id !== "string") {
    return null;
  }
  return {
    mashIntent: typeof record.mash_intent === "string" ? record.mash_intent : "",
    sourceVocalStemArtifactId: record.source_vocal_stem_artifact_id,
    targetInstrumentalStemArtifactId:
      typeof record.target_instrumental_stem_artifact_id === "string"
        ? record.target_instrumental_stem_artifact_id
        : "",
    tempoRatio: parseNullableNumber(record.tempo_ratio),
    pitchShiftSemitones: parseNullableNumber(record.pitch_shift_semitones) ?? 0,
    alignmentOffsetMs: parseNullableNumber(record.alignment_offset_ms) ?? 0,
    neutralProcessing: record.neutral_processing === true,
  };
}

function parseFullProcessingSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    method: typeof record.method === "string" ? record.method : "",
    vocalRubberbandRatio: parseNullableNumber(record.vocal_rubberband_ratio),
    pitchShiftSemitones: parseNullableNumber(record.pitch_shift_semitones) ?? 0,
    alignmentOffsetMs: parseNullableNumber(record.alignment_offset_ms) ?? 0,
    fullLength: record.full_length === true,
    maxTestSeconds: parseNullableNumber(record.max_test_seconds),
  };
}

function parseLoudnessGate(value: unknown): LoudnessGateDisplay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status =
    record.status === "pass" || record.status === "warn" || record.status === "not_available"
      ? record.status
      : "not_available";
  return {
    status,
    message: typeof record.message === "string" ? record.message : "Loudness gate unavailable.",
    integratedLufs: parseNullableNumber(record.integrated_lufs),
    truePeakDbtp: parseNullableNumber(record.true_peak_dbtp),
    targetIntegratedLufs: parseNullableNumber(record.target_integrated_lufs) ?? -14,
    targetTruePeakDbtp: parseNullableNumber(record.target_true_peak_dbtp) ?? -1,
  };
}
