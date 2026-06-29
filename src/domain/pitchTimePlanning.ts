import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import { resolvePlanningBpm } from "./sessionArtifacts.ts";
import type { PlanningValueSource } from "./trackOverrides.ts";
import {
  formatKeyLabel,
  suggestInstrumentalShiftSemitones,
  suggestVocalShiftSemitones,
  type KeyProfile,
} from "./harmonicPlanning.ts";
import type { SlotId } from "./types.ts";

export type TempoDirection = "speed_up" | "slow_down" | "none" | "unknown";
export type MashIntent = "vocal_a_over_beat_b" | "vocal_b_over_beat_a" | "compare_both";
export type RubberBandReadiness = "available" | "missing" | "planned" | "unknown";

export const PLANNING_ONLY_NOTICE =
  "Planning only — no audio has been processed yet. Rubber Band processing is a future lane.";

const SAFE_PITCH_SHIFT_SEMITONES = 4;
const WARN_PITCH_SHIFT_SEMITONES = 6;

export interface TrackPlanningInput {
  slotId: SlotId;
  label: string;
  bpm: number | null;
  bpmSource: PlanningValueSource;
  keyProfile: KeyProfile;
  keySource: PlanningValueSource;
  camelotSource: PlanningValueSource;
}

export interface PitchTimeDirectionPlan {
  intentLabel: string;
  vocalTrackLabel: string;
  instrumentalTrackLabel: string;
  sourceBpm: number | null;
  targetBpm: number | null;
  bpmDifference: number | null;
  tempoStretchRatio: number | null;
  tempoStretchPercent: number | null;
  tempoDirection: TempoDirection;
  tempoPlanSummary: string;
  sourceKeyLabel: string;
  targetKeyLabel: string;
  sourceCamelot: string | null;
  targetCamelot: string | null;
  suggestedPitchShiftSemitones: number | null;
  safeRangeWarning: string | null;
  formantPreservationNote: string;
  vocalAdjustmentNote: string;
  instrumentalAdjustmentNote: string;
  bpmSource: PlanningValueSource;
  keySource: PlanningValueSource;
  camelotSource: PlanningValueSource;
  limitations: string[];
  djReviewRequired: true;
}

export interface PitchTimePlanModel {
  intent: MashIntent;
  rubberBandStatus: RubberBandReadiness;
  rubberBandMessage: string;
  directions: PitchTimeDirectionPlan[];
  limitations: string[];
  djReviewRequired: true;
  audioProcessed: false;
  planningOnlyNotice: string;
}

export function buildTrackPlanningInput(
  artifactStore: SessionArtifactStore,
  slotId: SlotId,
  label: string
): TrackPlanningInput {
  const artifact = artifactStore.tracks[slotId];
  const bpm = resolvePlanningBpm(artifact);
  const keyProfile = artifact?.effectiveKeyProfile ?? {
    key: null,
    mode: "unknown" as const,
    camelot: null,
    confidence: null,
    method: null,
    keySource: "unavailable" as const,
    camelotSource: "unavailable" as const,
    isUserSupplied: false,
  };

  return {
    slotId,
    label,
    bpm: bpm.value,
    bpmSource: bpm.source,
    keyProfile: {
      key: keyProfile.key,
      mode: keyProfile.mode,
      camelot: keyProfile.camelot,
      confidence: keyProfile.confidence,
      method: keyProfile.method,
    },
    keySource: keyProfile.keySource,
    camelotSource: keyProfile.camelotSource,
  };
}

export function buildPitchTimePlan(params: {
  trackA: TrackPlanningInput;
  trackB: TrackPlanningInput;
  intent: MashIntent;
  rubberBandStatus?: RubberBandReadiness;
  rubberBandMessage?: string;
}): PitchTimePlanModel {
  const rubberBandStatus = params.rubberBandStatus ?? "unknown";
  const rubberBandMessage =
    params.rubberBandMessage ?? "Rubber Band readiness unknown. Browser-only planning remains available.";

  const directionPairs = resolveIntentDirectionPairs(params.intent, params.trackA, params.trackB);
  const directions = directionPairs.map((pair) =>
    buildDirectionPlan({
      vocal: pair.vocal,
      instrumental: pair.instrumental,
      intentLabel: pair.intentLabel,
    })
  );

  const limitations = [
    PLANNING_ONLY_NOTICE,
    "Stem separation is not implemented. Vocal/instrumental roles are planning assumptions only.",
    "Tempo and pitch suggestions use detected or DJ-overridden values.",
    "Double/half tempo ambiguity from beat detection is not resolved here.",
  ];

  if (rubberBandStatus === "missing") {
    limitations.push("Rubber Band CLI is not installed. Processing cannot run until it is available.");
  }

  return {
    intent: params.intent,
    rubberBandStatus,
    rubberBandMessage,
    directions,
    limitations,
    djReviewRequired: true,
    audioProcessed: false,
    planningOnlyNotice: PLANNING_ONLY_NOTICE,
  };
}

export function buildPitchTimePlanFromArtifacts(params: {
  artifactStore: SessionArtifactStore;
  intent: MashIntent;
  rubberBandStatus?: RubberBandReadiness;
  rubberBandMessage?: string;
}): PitchTimePlanModel | null {
  if (!params.artifactStore.tracks.trackA || !params.artifactStore.tracks.trackB) {
    return null;
  }

  return buildPitchTimePlan({
    trackA: buildTrackPlanningInput(params.artifactStore, "trackA", "Track A"),
    trackB: buildTrackPlanningInput(params.artifactStore, "trackB", "Track B"),
    intent: params.intent,
    rubberBandStatus: params.rubberBandStatus,
    rubberBandMessage: params.rubberBandMessage,
  });
}

export function resolveIntentDirectionPairs(
  intent: MashIntent,
  trackA: TrackPlanningInput,
  trackB: TrackPlanningInput
): Array<{
  intentLabel: string;
  vocal: TrackPlanningInput;
  instrumental: TrackPlanningInput;
}> {
  switch (intent) {
    case "vocal_a_over_beat_b":
      return [{ intentLabel: "Vocal A over Beat B", vocal: trackA, instrumental: trackB }];
    case "vocal_b_over_beat_a":
      return [{ intentLabel: "Vocal B over Beat A", vocal: trackB, instrumental: trackA }];
    default:
      return [
        { intentLabel: "Vocal A over Beat B", vocal: trackA, instrumental: trackB },
        { intentLabel: "Vocal B over Beat A", vocal: trackB, instrumental: trackA },
      ];
  }
}

export function computeTempoStretchRatio(sourceBpm: number | null, targetBpm: number | null): number | null {
  if (sourceBpm === null || targetBpm === null || sourceBpm <= 0 || targetBpm <= 0) {
    return null;
  }

  return roundRatio(targetBpm / sourceBpm);
}

export function computeTempoStretchPercent(ratio: number | null): number | null {
  if (ratio === null || !Number.isFinite(ratio)) {
    return null;
  }

  return roundRatio((ratio - 1) * 100);
}

export function resolveTempoDirection(ratio: number | null): TempoDirection {
  if (ratio === null || !Number.isFinite(ratio)) {
    return "unknown";
  }

  if (Math.abs(ratio - 1) < 0.005) {
    return "none";
  }

  return ratio > 1 ? "speed_up" : "slow_down";
}

export function buildSafeRangeWarning(semitones: number | null): string | null {
  if (semitones === null) {
    return null;
  }

  const abs = Math.abs(semitones);
  if (abs > WARN_PITCH_SHIFT_SEMITONES) {
    return `Suggested pitch shift (${semitones} semitones) exceeds the ${WARN_PITCH_SHIFT_SEMITONES}-semitone vocal-safe range. Expect audible artifacts if applied later.`;
  }

  if (abs > SAFE_PITCH_SHIFT_SEMITONES) {
    return `Suggested pitch shift (${semitones} semitones) is outside the ${SAFE_PITCH_SHIFT_SEMITONES}-semitone comfort zone. DJ review required.`;
  }

  return null;
}

export function formatTempoPlanSummary(
  vocalLabel: string,
  instrumentalLabel: string,
  percent: number | null,
  direction: TempoDirection
): string {
  if (percent === null || direction === "unknown") {
    return `${vocalLabel} tempo adjustment toward ${instrumentalLabel} is unavailable until BPM exists for both tracks.`;
  }

  if (direction === "none") {
    return `${vocalLabel} tempo is already close to ${instrumentalLabel}. A small manual nudge may still be needed.`;
  }

  const sign = percent > 0 ? "+" : "";
  const verb = direction === "speed_up" ? "speed up" : "slow down";
  return `${vocalLabel} would need ${sign}${percent.toFixed(1)}% tempo adjustment (${verb}) to sit over ${instrumentalLabel}. Planning only.`;
}

export function formatPitchShiftSummary(semitones: number | null): string {
  if (semitones === null) {
    return "No safe pitch shift recommended until key/Camelot data exists for both tracks.";
  }

  if (semitones === 0) {
    return "No pitch shift suggested — keys already align on the Camelot wheel.";
  }

  const sign = semitones > 0 ? "+" : "";
  return `Suggested vocal shift: ${sign}${semitones} semitones. Planning only — no audio processed.`;
}

export function rubberBandReadinessFromCapabilityStatus(
  status: string | undefined
): RubberBandReadiness {
  switch (status) {
    case "available":
      return "available";
    case "missing":
      return "missing";
    case "planned":
      return "planned";
    default:
      return "unknown";
  }
}

export function intentLabel(intent: MashIntent): string {
  switch (intent) {
    case "vocal_a_over_beat_b":
      return "Vocal A over Beat B";
    case "vocal_b_over_beat_a":
      return "Vocal B over Beat A";
    default:
      return "Compare both directions";
  }
}

export function planClaimsAudioProcessed(_plan: PitchTimePlanModel): boolean {
  return false;
}

function buildDirectionPlan(params: {
  vocal: TrackPlanningInput;
  instrumental: TrackPlanningInput;
  intentLabel: string;
}): PitchTimeDirectionPlan {
  const ratio = computeTempoStretchRatio(params.vocal.bpm, params.instrumental.bpm);
  const percent = computeTempoStretchPercent(ratio);
  const direction = resolveTempoDirection(ratio);
  const bpmDifference =
    params.vocal.bpm !== null && params.instrumental.bpm !== null
      ? roundRatio(Math.abs(params.vocal.bpm - params.instrumental.bpm))
      : null;

  const instrumentalShift = suggestInstrumentalShiftSemitones(
    params.instrumental.keyProfile,
    params.vocal.keyProfile
  );
  const vocalShift = suggestVocalShiftSemitones(
    params.instrumental.keyProfile,
    params.vocal.keyProfile,
    instrumentalShift
  );
  const safeRangeWarning = buildSafeRangeWarning(vocalShift);

  const formantPreservationNote =
    vocalShift !== null && vocalShift !== 0
      ? "Recommend Rubber Band formant preservation for vocal pitch shifts to reduce chipmunk/boomy artifacts. Not applied in this phase."
      : "Formant preservation is most important when vocal pitch shift is non-zero. Not applicable for this plan.";

  return {
    intentLabel: params.intentLabel,
    vocalTrackLabel: params.vocal.label,
    instrumentalTrackLabel: params.instrumental.label,
    sourceBpm: params.vocal.bpm,
    targetBpm: params.instrumental.bpm,
    bpmDifference,
    tempoStretchRatio: ratio,
    tempoStretchPercent: percent,
    tempoDirection: direction,
    tempoPlanSummary: formatTempoPlanSummary(
      params.vocal.label,
      params.instrumental.label,
      percent,
      direction
    ),
    sourceKeyLabel: formatKeyLabel(params.vocal.keyProfile),
    targetKeyLabel: formatKeyLabel(params.instrumental.keyProfile),
    sourceCamelot: params.vocal.keyProfile.camelot,
    targetCamelot: params.instrumental.keyProfile.camelot,
    suggestedPitchShiftSemitones: vocalShift,
    safeRangeWarning,
    formantPreservationNote,
    vocalAdjustmentNote:
      ratio !== null
        ? `${params.vocal.label}: apply tempo stretch ratio ${ratio.toFixed(3)} toward ${params.instrumental.label} BPM when processing exists.`
        : `${params.vocal.label}: tempo adjustment unavailable.`,
    instrumentalAdjustmentNote: `${params.instrumental.label}: keep as tempo/key anchor unless DJ chooses otherwise.`,
    bpmSource: mergeSources(params.vocal.bpmSource, params.instrumental.bpmSource),
    keySource: mergeSources(params.vocal.keySource, params.instrumental.keySource),
    camelotSource: mergeSources(params.vocal.camelotSource, params.instrumental.camelotSource),
    limitations: [
      "Planning assumption: full track treated as vocal/instrumental role. True stem separation is not implemented.",
      PLANNING_ONLY_NOTICE,
    ],
    djReviewRequired: true,
  };
}

function mergeSources(a: PlanningValueSource, b: PlanningValueSource): PlanningValueSource {
  if (a === "user_override" || b === "user_override") {
    return "user_override";
  }

  if (a === "heuristic" || b === "heuristic") {
    return "heuristic";
  }

  if (a === "detected" && b === "detected") {
    return "detected";
  }

  return "unavailable";
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}
