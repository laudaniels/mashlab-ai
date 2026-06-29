import type {
  PitchTimeDirectionPlan,
  PitchTimePlanModel,
  MashIntent,
  RubberBandReadiness,
} from "./pitchTimePlanning.ts";
import {
  buildTrackPlanningInput,
  resolveIntentDirectionPairs,
} from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { SlotId, TrackState } from "./types.ts";

export const PREVIEW_ONLY_NOTICE =
  "Preview only — not a final mashup, stem separation, or export. No vocal/instrumental isolation has occurred.";

export const PREVIEW_PROCESSED_LABEL = "Processed preview artifact — DJ review required.";

export interface PitchTimePreviewRequestParams {
  tempoRatio: number | null;
  sourceBpm: number | null;
  targetBpm: number | null;
  pitchShiftSemitones: number;
  maxPreviewSeconds: number;
  formantPreservation: boolean;
  vocalSlotId: SlotId;
  vocalFileName: string;
}

export interface PitchTimePreviewInputSummary {
  fileName: string;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  tempoRatio: number | null;
  pitchShiftSemitones: number;
  maxPreviewSeconds: number;
  formantPreservation: boolean;
}

export interface PitchTimePreviewOutputSummary {
  fileName: string;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  artifactId: string;
}

export interface PitchTimePreviewResult {
  ok: boolean;
  status: string;
  message: string;
  method: string | null;
  audioProcessed: boolean;
  inputSummary: PitchTimePreviewInputSummary | null;
  outputSummary: PitchTimePreviewOutputSummary | null;
  artifactUrl: string | null;
  artifactPlaybackUrl: string | null;
  warnings: string[];
  limitations: string[];
  setupGuidance: string | null;
  validationErrors: string[];
  isPreviewOnly: true;
}

export function hasActionablePitchTimeAdjustment(direction: PitchTimeDirectionPlan): boolean {
  const tempoAction =
    direction.tempoStretchRatio !== null && Math.abs(direction.tempoStretchRatio - 1) >= 0.005;
  const pitchAction =
    direction.suggestedPitchShiftSemitones !== null &&
    Math.abs(direction.suggestedPitchShiftSemitones) >= 0.001;

  return tempoAction || pitchAction;
}

export function isPreviewProcessingReady(params: {
  sidecarOnline: boolean;
  rubberBandStatus: RubberBandReadiness;
  direction: PitchTimeDirectionPlan;
  vocalTrack: TrackState | null;
}): { ready: boolean; reason: string } {
  if (!params.sidecarOnline) {
    return { ready: false, reason: "Local sidecar offline." };
  }

  if (params.rubberBandStatus !== "available") {
    return { ready: false, reason: "Rubber Band CLI is not available on PATH." };
  }

  if (!params.vocalTrack?.file) {
    return { ready: false, reason: "Source track file unavailable." };
  }

  if (!hasActionablePitchTimeAdjustment(params.direction)) {
    return {
      ready: false,
      reason: "No actionable tempo or pitch adjustment in the current plan.",
    };
  }

  return { ready: true, reason: "Ready for user-initiated preview processing." };
}

export function buildPreviewRequestParams(
  direction: PitchTimeDirectionPlan,
  vocalTrack: TrackState
): PitchTimePreviewRequestParams {
  return {
    tempoRatio: direction.tempoStretchRatio,
    sourceBpm: direction.sourceBpm,
    targetBpm: direction.targetBpm,
    pitchShiftSemitones: direction.suggestedPitchShiftSemitones ?? 0,
    maxPreviewSeconds: 30,
    formantPreservation: true,
    vocalSlotId: vocalTrack.slotId,
    vocalFileName: vocalTrack.file.name,
  };
}

export function resolvePreviewDirections(
  plan: PitchTimePlanModel,
  artifactStore: SessionArtifactStore,
  intent: MashIntent
): Array<{ direction: PitchTimeDirectionPlan; vocalSlotId: SlotId }> {
  const trackA = buildTrackPlanningInput(artifactStore, "trackA", "Track A");
  const trackB = buildTrackPlanningInput(artifactStore, "trackB", "Track B");
  const pairs = resolveIntentDirectionPairs(intent, trackA, trackB);

  return pairs.map((pair, index) => ({
    direction: plan.directions[index] ?? plan.directions[0]!,
    vocalSlotId: pair.vocal.slotId,
  }));
}

export function previewResultClaimsFinalExport(result: PitchTimePreviewResult): boolean {
  const haystack = [
    result.message,
    ...result.limitations,
    PREVIEW_ONLY_NOTICE,
    PREVIEW_PROCESSED_LABEL,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("final export") || haystack.includes("finished mashup");
}

export function formatPreviewStatusMessage(result: PitchTimePreviewResult): string {
  if (!result.ok) {
    return result.message;
  }

  return `${PREVIEW_PROCESSED_LABEL} ${result.message}`;
}
