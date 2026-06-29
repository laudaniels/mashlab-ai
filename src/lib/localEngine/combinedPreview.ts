import type {
  CombinedPreviewRequestParams,
  CombinedPreviewResult,
} from "../../domain/combinedPreview.ts";
import { COMBINED_PREVIEW_ONLY_NOTICE } from "../../domain/combinedPreview.ts";
import { parseMixSettings } from "../../domain/mixControls.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parseCombinedPreviewResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): CombinedPreviewResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const artifactUrl = typeof record.artifact_url === "string" ? record.artifact_url : null;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown combined preview response.",
    method: typeof record.method === "string" ? record.method : null,
    audioProcessed: record.audio_processed === true,
    finalExport: record.final_export === true,
    artifactId: typeof record.artifact_id === "string" ? record.artifact_id : null,
    artifactUrl,
    artifactPlaybackUrl: artifactUrl ? `${baseUrl}${artifactUrl}` : null,
    inputSummary: parseInputSummary(record.input_summary),
    processingSummary: parseProcessingSummary(record.processing_summary),
    outputDurationSeconds: parseNullableNumber(record.output_duration_seconds),
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    validationErrors: parseStringArray(record.validation_errors),
    isPreviewOnly: true,
  };
}

export function validateCombinedPreviewRequestParams(
  params: CombinedPreviewRequestParams
): string[] {
  const errors: string[] = [];

  if (
    params.mashIntent !== "vocal_a_over_beat_b" &&
    params.mashIntent !== "vocal_b_over_beat_a"
  ) {
    errors.push("mash_intent must be vocal_a_over_beat_b or vocal_b_over_beat_a.");
  }

  if (!params.sourceVocalArtifactId || !params.targetInstrumentalArtifactId) {
    errors.push("Both source vocal and target instrumental artifact ids are required.");
  }

  if (params.maxPreviewSeconds < 1 || params.maxPreviewSeconds > 60) {
    errors.push("max_preview_seconds must be between 1 and 60.");
  }

  if (!Number.isFinite(params.previewStartSeconds) || params.previewStartSeconds < 0) {
    errors.push("preview_start_seconds must be zero or greater.");
  }

  return errors;
}

export function combinedPreviewFailureIsMissingArtifact(result: CombinedPreviewResult): boolean {
  return !result.ok && result.status === "missing_artifact";
}

export function combinedPreviewFailureIsMissingDependency(result: CombinedPreviewResult): boolean {
  return !result.ok && result.status === "missing_dependency";
}

export function defaultCombinedPreviewLimitations(): string[] {
  return [COMBINED_PREVIEW_ONLY_NOTICE];
}

function parseInputSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    mashIntent: typeof record.mash_intent === "string" ? record.mash_intent : "unknown",
    sourceVocalArtifactId:
      typeof record.source_vocal_artifact_id === "string" ? record.source_vocal_artifact_id : "",
    targetInstrumentalArtifactId:
      typeof record.target_instrumental_artifact_id === "string"
        ? record.target_instrumental_artifact_id
        : "",
    tempoRatio: parseNullableNumber(record.tempo_ratio),
    pitchShiftSemitones: parseNullableNumber(record.pitch_shift_semitones) ?? 0,
    alignmentOffsetMs: parseNullableNumber(record.alignment_offset_ms) ?? 0,
    maxPreviewSeconds: parseNullableNumber(record.max_preview_seconds) ?? 30,
    previewStartSeconds: parseNullableNumber(record.preview_start_seconds) ?? 0,
    neutralProcessing: record.neutral_processing === true,
    mixSettings: parseMixSettings(record.mix_settings),
  };
}

function parseProcessingSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    method: typeof record.method === "string" ? record.method : "unknown",
    vocalRubberbandRatio: parseNullableNumber(record.vocal_rubberband_ratio),
    pitchShiftSemitones: parseNullableNumber(record.pitch_shift_semitones) ?? 0,
    alignmentOffsetMs: parseNullableNumber(record.alignment_offset_ms) ?? 0,
    maxPreviewSeconds: parseNullableNumber(record.max_preview_seconds) ?? 30,
    previewStartSeconds: parseNullableNumber(record.preview_start_seconds) ?? 0,
    mixSettings: parseMixSettings(record.mix_settings),
    limiterSafetyApplied: record.limiter_safety_applied === true,
    clippingGuardApplied: record.clipping_guard_applied === true,
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
