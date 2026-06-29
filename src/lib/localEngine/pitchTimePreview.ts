import type { PitchTimePreviewRequestParams, PitchTimePreviewResult } from "../../domain/pitchTimePreview.ts";
import { PREVIEW_ONLY_NOTICE } from "../../domain/pitchTimePreview.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parsePitchTimePreviewResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): PitchTimePreviewResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const input = parseInputSummary(record.input_summary);
  const output = parseOutputSummary(record.output_summary);
  const artifactUrl = typeof record.artifact_url === "string" ? record.artifact_url : null;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown preview response.",
    method: typeof record.method === "string" ? record.method : null,
    audioProcessed: record.audio_processed === true,
    inputSummary: input,
    outputSummary: output,
    artifactUrl,
    artifactPlaybackUrl: artifactUrl ? `${baseUrl}${artifactUrl}` : null,
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    validationErrors: parseStringArray(record.validation_errors),
    isPreviewOnly: true,
  };
}

export function validatePreviewRequestParams(params: PitchTimePreviewRequestParams): string[] {
  const errors: string[] = [];

  if (params.maxPreviewSeconds < 1 || params.maxPreviewSeconds > 60) {
    errors.push("max_preview_seconds must be between 1 and 60.");
  }

  if (params.pitchShiftSemitones < -12 || params.pitchShiftSemitones > 12) {
    errors.push("pitch_shift_semitones must be between -12 and 12.");
  }

  const tempoAction =
    params.tempoRatio !== null && Math.abs(params.tempoRatio - 1) >= 0.005;
  const pitchAction = Math.abs(params.pitchShiftSemitones) >= 0.001;

  if (!tempoAction && !pitchAction) {
    errors.push("At least one actionable tempo or pitch adjustment is required.");
  }

  return errors;
}

export function buildPreviewFormData(
  file: File,
  params: PitchTimePreviewRequestParams
): FormData {
  const formData = new FormData();
  formData.append("file", file);

  if (params.tempoRatio !== null) {
    formData.append("tempo_ratio", String(params.tempoRatio));
  }
  if (params.sourceBpm !== null) {
    formData.append("source_bpm", String(params.sourceBpm));
  }
  if (params.targetBpm !== null) {
    formData.append("target_bpm", String(params.targetBpm));
  }

  formData.append("pitch_shift_semitones", String(params.pitchShiftSemitones));
  formData.append("max_preview_seconds", String(params.maxPreviewSeconds));
  formData.append("formant_preservation", params.formantPreservation ? "true" : "false");

  return formData;
}

export function previewResponseIsProcessedPreview(result: PitchTimePreviewResult): boolean {
  return result.ok && result.audioProcessed === true;
}

export function previewFailureIsMissingDependency(result: PitchTimePreviewResult): boolean {
  return !result.ok && result.status === "missing_dependency";
}

export function defaultPreviewLimitations(): string[] {
  return [PREVIEW_ONLY_NOTICE];
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
    tempoRatio: parseNullableNumber(record.tempo_ratio),
    pitchShiftSemitones: parseNullableNumber(record.pitch_shift_semitones) ?? 0,
    maxPreviewSeconds: parseNullableNumber(record.max_preview_seconds) ?? 30,
    formantPreservation: record.formant_preservation === true,
  };
}

function parseOutputSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.artifact_id !== "string") {
    return null;
  }

  return {
    fileName: typeof record.file_name === "string" ? record.file_name : `${record.artifact_id}.wav`,
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    artifactId: record.artifact_id,
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
