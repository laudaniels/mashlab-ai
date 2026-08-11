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
  "Planning only until you create an explicit pitch/time preview. Preview clips are local-only and not a final mashup or export.";

const SAFE_PITCH_SHIFT_SEMITONES = 4;
const WARN_PITCH_SHIFT_SEMITONES = 6;

// Mirrors MIN_TEMPO_RATIO/MAX_TEMPO_RATIO in local-engine/service/rubber_band_processing.py —
// surface the same bound client-side so the UI can warn before a preview/export request is
// sent and rejected by the sidecar.
export const MIN_TEMPO_RATIO = 0.5;
export const MAX_TEMPO_RATIO = 2.0;

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
  customTargetBpm: number | null;
  bpmDifference: number | null;
  tempoStretchRatio: number | null;
  tempoStretchPercent: number | null;
  tempoDirection: TempoDirection;
  instrumentalTempoStretchRatio: number | null;
  instrumentalTempoStretchPercent: number | null;
  instrumentalTempoDirection: TempoDirection;
  tempoPlanSummary: string;
  tempoRatioWarning: string | null;
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
  customTargetBpm?: number | null;
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
      customTargetBpm: params.customTargetBpm ?? null,
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
  customTargetBpm?: number | null;
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
    customTargetBpm: params.customTargetBpm,
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

export function tempoRatioOutOfRange(ratio: number | null): boolean {
  if (ratio === null || !Number.isFinite(ratio)) {
    return false;
  }

  return ratio < MIN_TEMPO_RATIO || ratio > MAX_TEMPO_RATIO;
}

export function buildTempoRatioWarning(params: {
  vocalLabel: string;
  instrumentalLabel: string;
  vocalRatio: number | null;
  instrumentalRatio: number | null;
}): string | null {
  const vocalOutOfRange = tempoRatioOutOfRange(params.vocalRatio);
  const instrumentalOutOfRange = tempoRatioOutOfRange(params.instrumentalRatio);

  if (!vocalOutOfRange && !instrumentalOutOfRange) {
    return null;
  }

  const offenders = [
    vocalOutOfRange ? params.vocalLabel : null,
    instrumentalOutOfRange ? params.instrumentalLabel : null,
  ].filter((label): label is string => label !== null);

  return `${offenders.join(" and ")} would need a tempo stretch ratio outside the supported ${MIN_TEMPO_RATIO}–${MAX_TEMPO_RATIO}x range for this target BPM. Choose a target closer to both tracks' native BPM.`;
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
  customTargetBpm: number | null;
}): PitchTimeDirectionPlan {
  const customTargetBpm = params.customTargetBpm !== null && params.customTargetBpm > 0 ? params.customTargetBpm : null;
  const targetBpm = customTargetBpm ?? params.instrumental.bpm;

  const ratio = computeTempoStretchRatio(params.vocal.bpm, targetBpm);
  const percent = computeTempoStretchPercent(ratio);
  const direction = resolveTempoDirection(ratio);

  const instrumentalRatio = computeTempoStretchRatio(params.instrumental.bpm, targetBpm);
  const instrumentalPercent = computeTempoStretchPercent(instrumentalRatio);
  const instrumentalDirection = resolveTempoDirection(instrumentalRatio);

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
  const tempoRatioWarning = buildTempoRatioWarning({
    vocalLabel: params.vocal.label,
    instrumentalLabel: params.instrumental.label,
    vocalRatio: ratio,
    instrumentalRatio,
  });

  const formantPreservationNote =
    vocalShift !== null && vocalShift !== 0
      ? "Recommend Rubber Band formant preservation for vocal pitch shifts to reduce chipmunk/boomy artifacts. Not applied in this phase."
      : "Formant preservation is most important when vocal pitch shift is non-zero. Not applicable for this plan.";

  // Default (no custom target): vocal moves toward the instrumental's own BPM, as before.
  // Custom target set: both tracks move toward the custom BPM value instead.
  const targetLabel = customTargetBpm !== null ? `${customTargetBpm} BPM target` : params.instrumental.label;

  return {
    intentLabel: params.intentLabel,
    vocalTrackLabel: params.vocal.label,
    instrumentalTrackLabel: params.instrumental.label,
    sourceBpm: params.vocal.bpm,
    targetBpm,
    customTargetBpm,
    bpmDifference,
    tempoStretchRatio: ratio,
    tempoStretchPercent: percent,
    tempoDirection: direction,
    instrumentalTempoStretchRatio: instrumentalRatio,
    instrumentalTempoStretchPercent: instrumentalPercent,
    instrumentalTempoDirection: instrumentalDirection,
    tempoPlanSummary: formatTempoPlanSummary(params.vocal.label, targetLabel, percent, direction),
    tempoRatioWarning,
    sourceKeyLabel: formatKeyLabel(params.vocal.keyProfile),
    targetKeyLabel: formatKeyLabel(params.instrumental.keyProfile),
    sourceCamelot: params.vocal.keyProfile.camelot,
    targetCamelot: params.instrumental.keyProfile.camelot,
    suggestedPitchShiftSemitones: vocalShift,
    safeRangeWarning,
    formantPreservationNote,
    vocalAdjustmentNote: formatTrackStretchNote(params.vocal.label, ratio, targetLabel),
    instrumentalAdjustmentNote:
      instrumentalDirection === "none"
        ? `${params.instrumental.label}: keep as tempo/key anchor unless DJ chooses otherwise.`
        : formatTrackStretchNote(params.instrumental.label, instrumentalRatio, targetLabel),
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

function formatTrackStretchNote(label: string, ratio: number | null, targetLabel: string): string {
  return ratio !== null
    ? `${label}: apply tempo stretch ratio ${ratio.toFixed(3)} toward ${targetLabel} when processing exists.`
    : `${label}: tempo adjustment unavailable.`;
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
