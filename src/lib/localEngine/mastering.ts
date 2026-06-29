import type {
  MasteringGateDisplay,
  MasterWavResult,
  TechnicalReadoutDisplay,
} from "../../domain/masteringPresets.ts";
import { DEFAULT_MASTER_RIGHTS_NOTICE } from "../../domain/masteringPresets.ts";
import type { LoudnessReadout } from "../../domain/previewArtifacts.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parseMasterWavResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): MasterWavResult | null {
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
    message: typeof record.message === "string" ? record.message : "Unknown mastering response.",
    masterArtifactId:
      typeof record.master_artifact_id === "string" ? record.master_artifact_id : null,
    sourceWavExportArtifactId:
      typeof record.source_wav_export_artifact_id === "string"
        ? record.source_wav_export_artifact_id
        : null,
    preset: typeof record.preset === "string" ? record.preset : null,
    artifactUrl: typeof record.artifact_url === "string" ? record.artifact_url : null,
    downloadUrl: downloadPath,
    playbackUrl: downloadPath ? `${baseUrl}${downloadPath}` : null,
    beforeReadout: parseTechnicalReadout(record.before_readout),
    afterReadout: parseTechnicalReadout(record.after_readout),
    targetIntegratedLufs: parseNullableNumber(record.target_integrated_lufs),
    targetTruePeakDbtp: parseNullableNumber(record.target_true_peak_dbtp),
    loudnessGate: parseMasteringGate(record.loudness_gate),
    audioCreated: record.audio_created === true,
    finalExport: record.final_export === true,
    publicShare: record.public_share === true,
    masteringPrototype: record.mastering_prototype === true,
    rightsNotice:
      typeof record.rights_notice === "string"
        ? record.rights_notice
        : DEFAULT_MASTER_RIGHTS_NOTICE,
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    exportLabel: typeof record.export_label === "string" ? record.export_label : null,
    validationErrors: parseStringArrayOrNull(record.validation_errors),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
  };
}

function parseTechnicalReadout(value: unknown): TechnicalReadoutDisplay | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    codec: typeof record.codec === "string" ? record.codec : null,
    container: typeof record.container === "string" ? record.container : null,
    fileSizeBytes: parseNullableNumber(record.file_size_bytes),
    loudness: parseLoudnessReadout(record.loudness),
  };
}

function parseLoudnessReadout(value: unknown): LoudnessReadout {
  if (!value || typeof value !== "object") {
    return {
      integratedLufs: null,
      truePeakDbtp: null,
      peakLevelDb: null,
      status: "not_available",
      message: "Loudness readout unavailable.",
    };
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

function parseMasteringGate(value: unknown): MasteringGateDisplay | null {
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
    message: typeof record.message === "string" ? record.message : "Gate unavailable.",
    integratedLufs: parseNullableNumber(record.integrated_lufs),
    truePeakDbtp: parseNullableNumber(record.true_peak_dbtp),
    targetIntegratedLufs: parseNullableNumber(record.target_integrated_lufs) ?? -14,
    targetTruePeakDbtp: parseNullableNumber(record.target_true_peak_dbtp) ?? -1,
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
