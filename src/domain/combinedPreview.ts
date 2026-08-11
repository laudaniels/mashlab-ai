import type { MixSettings } from "./mixControls.ts";
import { mixSettingsToRequestFields } from "./mixControls.ts";
import type { ArrangementSectionContext } from "./arrangementSectionContext.ts";
import { serializeArrangementContextForApi } from "./arrangementSectionContext.ts";
import {
  COMBINED_PREVIEW_DEFAULT_SECONDS,
  COMBINED_PREVIEW_MAX_SECONDS,
} from "./combinedPreviewConstants.ts";
import type { MashIntent, PitchTimeDirectionPlan } from "./pitchTimePlanning.ts";
import { resolveIntentDirectionPairs, buildTrackPlanningInput } from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { SlotId } from "./types.ts";

export const COMBINED_PREVIEW_ONLY_NOTICE =
  "Preview only — not a final export. No mastering, no final arrangement, no distribution rights granted.";

export const COMBINED_PREVIEW_PROCESSED_LABEL =
  "Combined vocal-over-instrumental preview — DJ review required.";

export const MISSING_STEM_ARTIFACTS_MESSAGE = "Create stem previews for both tracks first.";

export type { CombinedPreviewDurationOption } from "./combinedPreviewConstants.ts";
export {
  COMBINED_PREVIEW_DEFAULT_SECONDS,
  COMBINED_PREVIEW_DURATION_OPTIONS,
  COMBINED_PREVIEW_MAX_SECONDS,
} from "./combinedPreviewConstants.ts";

export type CombinedMashIntent = "vocal_a_over_beat_b" | "vocal_b_over_beat_a";

export interface CombinedPreviewDirectionContext {
  mashIntent: CombinedMashIntent;
  intentLabel: string;
  direction: PitchTimeDirectionPlan;
  sourceVocalSlotId: SlotId;
  targetInstrumentalSlotId: SlotId;
  sourceVocalArtifactId: string | null;
  targetInstrumentalArtifactId: string | null;
  alignmentOffsetMs: number;
}

export interface CombinedPreviewRequestParams {
  mashIntent: CombinedMashIntent;
  sourceVocalArtifactId: string;
  targetInstrumentalArtifactId: string;
  tempoRatio: number | null;
  instrumentalTempoRatio: number | null;
  sourceBpm: number | null;
  targetBpm: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  maxPreviewSeconds: number;
  previewStartSeconds: number;
  formantPreservation: boolean;
  neutralProcessing: boolean;
  mixSettings: MixSettings;
  arrangementContext?: ArrangementSectionContext | null;
}

export interface CombinedPreviewProcessingSummary {
  method: string;
  vocalRubberbandRatio: number | null;
  instrumentalRubberbandRatio: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  maxPreviewSeconds: number;
  mixSettings: MixSettings | null;
  limiterSafetyApplied: boolean;
  clippingGuardApplied: boolean;
}

export interface CombinedPreviewInputSummary {
  mashIntent: string;
  sourceVocalArtifactId: string;
  targetInstrumentalArtifactId: string;
  tempoRatio: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  maxPreviewSeconds: number;
  previewStartSeconds: number;
  neutralProcessing: boolean;
  mixSettings: MixSettings | null;
}

export interface CombinedPreviewResult {
  ok: boolean;
  status: string;
  message: string;
  method: string | null;
  audioProcessed: boolean;
  finalExport: boolean;
  artifactId: string | null;
  artifactUrl: string | null;
  artifactPlaybackUrl: string | null;
  inputSummary: CombinedPreviewInputSummary | null;
  processingSummary: CombinedPreviewProcessingSummary | null;
  outputDurationSeconds: number | null;
  warnings: string[];
  limitations: string[];
  setupGuidance: string | null;
  validationErrors: string[];
  isPreviewOnly: true;
}

export function resolveCombinedPreviewDirections(
  artifactStore: SessionArtifactStore,
  intent: MashIntent,
  directions: PitchTimeDirectionPlan[]
): CombinedPreviewDirectionContext[] {
  const trackA = buildTrackPlanningInput(artifactStore, "trackA", "Track A");
  const trackB = buildTrackPlanningInput(artifactStore, "trackB", "Track B");
  const pairs = resolveIntentDirectionPairs(intent, trackA, trackB);

  return pairs.map((pair, index) => {
    const direction = directions[index] ?? directions[0]!;
    const mashIntent = pairToCombinedIntent(pair.intentLabel);
    const sourceVocalSlotId = pair.vocal.slotId;
    const targetInstrumentalSlotId = pair.instrumental.slotId;

    return {
      mashIntent,
      intentLabel: pair.intentLabel,
      direction,
      sourceVocalSlotId,
      targetInstrumentalSlotId,
      sourceVocalArtifactId:
        artifactStore.tracks[sourceVocalSlotId]?.stemPreview?.artifactId ?? null,
      targetInstrumentalArtifactId:
        artifactStore.tracks[targetInstrumentalSlotId]?.stemPreview?.artifactId ?? null,
      alignmentOffsetMs: resolveAlignmentOffsetMs(
        artifactStore,
        sourceVocalSlotId,
        targetInstrumentalSlotId
      ),
    };
  });
}

export function isCombinedPreviewReady(params: {
  sidecarOnline: boolean;
  rubberBandAvailable: boolean;
  context: CombinedPreviewDirectionContext;
  useNeutralProcessing: boolean;
}): { ready: boolean; reason: string } {
  if (!params.sidecarOnline) {
    return { ready: false, reason: "Local sidecar offline." };
  }

  if (!params.rubberBandAvailable) {
    return { ready: false, reason: "Rubber Band CLI is not available on PATH." };
  }

  if (!params.context.sourceVocalArtifactId || !params.context.targetInstrumentalArtifactId) {
    return { ready: false, reason: MISSING_STEM_ARTIFACTS_MESSAGE };
  }

  const direction = params.context.direction;
  const hasBpm =
    direction.sourceBpm !== null &&
    direction.targetBpm !== null &&
    direction.tempoStretchRatio !== null;
  const hasPitch = direction.suggestedPitchShiftSemitones !== null;

  if (!params.useNeutralProcessing && !hasBpm && !hasPitch) {
    return {
      ready: false,
      reason:
        "Pitch/time values are unknown. Enable neutral processing or add BPM/key overrides.",
    };
  }

  return { ready: true, reason: "Ready for user-initiated combined preview." };
}

export function buildCombinedPreviewRequestParams(
  context: CombinedPreviewDirectionContext,
  useNeutralProcessing: boolean,
  maxPreviewSeconds: number = COMBINED_PREVIEW_DEFAULT_SECONDS,
  mixSettings: MixSettings,
  previewStartSeconds: number = 0
): CombinedPreviewRequestParams {
  const direction = context.direction;

  return {
    mashIntent: context.mashIntent,
    sourceVocalArtifactId: context.sourceVocalArtifactId!,
    targetInstrumentalArtifactId: context.targetInstrumentalArtifactId!,
    tempoRatio: useNeutralProcessing ? 1 : direction.tempoStretchRatio,
    instrumentalTempoRatio: useNeutralProcessing ? 1 : direction.instrumentalTempoStretchRatio,
    sourceBpm: direction.sourceBpm,
    targetBpm: direction.targetBpm,
    pitchShiftSemitones: useNeutralProcessing ? 0 : (direction.suggestedPitchShiftSemitones ?? 0),
    alignmentOffsetMs: context.alignmentOffsetMs,
    maxPreviewSeconds,
    previewStartSeconds: Math.max(0, previewStartSeconds),
    formantPreservation: true,
    neutralProcessing: useNeutralProcessing,
    mixSettings,
  };
}

export function combinedPreviewRequestIncludesMixSettings(
  params: CombinedPreviewRequestParams
): boolean {
  return mixSettingsToRequestFields(params.mixSettings) !== undefined;
}

export function serializeCombinedPreviewRequestBody(params: CombinedPreviewRequestParams) {
  const body: Record<string, unknown> = {
    mash_intent: params.mashIntent,
    source_vocal_artifact_id: params.sourceVocalArtifactId,
    target_instrumental_artifact_id: params.targetInstrumentalArtifactId,
    tempo_ratio: params.tempoRatio,
    instrumental_tempo_ratio: params.instrumentalTempoRatio,
    source_bpm: params.sourceBpm,
    target_bpm: params.targetBpm,
    pitch_shift_semitones: params.pitchShiftSemitones,
    alignment_offset_ms: params.alignmentOffsetMs,
    max_preview_seconds: params.maxPreviewSeconds,
    preview_start_seconds: params.previewStartSeconds,
    formant_preservation: params.formantPreservation,
    neutral_processing: params.neutralProcessing,
    ...mixSettingsToRequestFields(params.mixSettings),
  };
  const context = serializeArrangementContextForApi(params.arrangementContext ?? null);
  if (context) {
    body.arrangement_context = context;
  }
  return body;
}

export function validateCombinedPreviewDuration(seconds: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > COMBINED_PREVIEW_MAX_SECONDS) {
    errors.push(`max_preview_seconds must be between 1 and ${COMBINED_PREVIEW_MAX_SECONDS}.`);
  }
  return errors;
}

export function validateCombinedPreviewStartOffset(seconds: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(seconds) || seconds < 0) {
    errors.push("preview_start_seconds must be zero or greater.");
  }
  return errors;
}

export function combinedPreviewDurationWarning(seconds: number): string | null {
  if (seconds >= 60) {
    return "Longer previews may take significantly more time to process locally.";
  }
  if (seconds >= 45) {
    return "Preview length above 45 seconds may increase Rubber Band + FFmpeg processing time.";
  }
  return null;
}

export function combinedPreviewFinalExportIsFalse(result: CombinedPreviewResult): boolean {
  return result.finalExport === false;
}

export function formatCombinedPreviewStatusMessage(result: CombinedPreviewResult): string {
  if (!result.ok) {
    return result.message;
  }

  return `${COMBINED_PREVIEW_PROCESSED_LABEL} ${result.message}`;
}

function pairToCombinedIntent(intentLabel: string): CombinedMashIntent {
  if (intentLabel.includes("Vocal B")) {
    return "vocal_b_over_beat_a";
  }

  return "vocal_a_over_beat_b";
}

function resolveAlignmentOffsetMs(
  artifactStore: SessionArtifactStore,
  sourceSlotId: SlotId,
  targetSlotId: SlotId
): number {
  const sourceOffset = artifactStore.tracks[sourceSlotId]?.overrides.alignmentOffsetSeconds ?? 0;
  const targetOffset = artifactStore.tracks[targetSlotId]?.overrides.alignmentOffsetSeconds ?? 0;
  return Math.round((sourceOffset - targetOffset) * 1000);
}
