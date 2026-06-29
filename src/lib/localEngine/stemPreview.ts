import type { StemPreviewRequestParams, StemPreviewResult } from "../../domain/stemPreview.ts";
import { STEM_PREVIEW_ONLY_NOTICE } from "../../domain/stemPreview.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parseStemPreviewResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): StemPreviewResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown stem preview response.",
    method: typeof record.method === "string" ? record.method : null,
    audioProcessed: record.audio_processed === true,
    artifactId: typeof record.artifact_id === "string" ? record.artifact_id : null,
    inputSummary: parseInputSummary(record.input_summary),
    vocals: parseStemArtifact(record.vocals, baseUrl),
    noVocals: parseStemArtifact(record.no_vocals, baseUrl),
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    validationErrors: parseStringArray(record.validation_errors),
    isPreviewOnly: true,
  };
}

export function validateStemPreviewRequestParams(params: StemPreviewRequestParams): string[] {
  const errors: string[] = [];

  if (params.splitMode !== "vocals_no_vocals") {
    errors.push("split_mode must be vocals_no_vocals in Phase 10.");
  }

  if (params.maxPreviewSeconds < 1 || params.maxPreviewSeconds > 180) {
    errors.push("max_preview_seconds must be between 1 and 180.");
  }

  return errors;
}

export function buildStemPreviewFormData(
  file: File,
  params: StemPreviewRequestParams
): FormData {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("split_mode", params.splitMode);
  formData.append("max_preview_seconds", String(params.maxPreviewSeconds));
  return formData;
}

export function stemPreviewResponseIsProcessed(result: StemPreviewResult): boolean {
  return result.ok && result.audioProcessed === true;
}

export function stemPreviewFailureIsMissingDependency(result: StemPreviewResult): boolean {
  return !result.ok && result.status === "missing_dependency";
}

export function defaultStemPreviewLimitations(): string[] {
  return [STEM_PREVIEW_ONLY_NOTICE];
}

function parseInputSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    fileName: typeof record.file_name === "string" ? record.file_name : "unknown",
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    splitMode: typeof record.split_mode === "string" ? record.split_mode : "vocals_no_vocals",
    maxPreviewSeconds: parseNullableNumber(record.max_preview_seconds),
  };
}

function parseStemArtifact(value: unknown, baseUrl: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.artifact_url !== "string") {
    return null;
  }

  return {
    fileName: typeof record.file_name === "string" ? record.file_name : "stem.wav",
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    artifactUrl: record.artifact_url,
    playbackUrl: `${baseUrl}${record.artifact_url}`,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}
