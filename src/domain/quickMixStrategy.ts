import type { CombinedPreviewDirectionContext } from "./combinedPreview.ts";
import {
  computeTempoStretchPercent,
  computeTempoStretchRatio,
  formatTempoPlanSummary,
  PLANNING_ONLY_NOTICE,
  resolveTempoDirection,
  type PitchTimeDirectionPlan,
} from "./pitchTimePlanning.ts";
import { QUICK_MIX_NEUTRAL_TIMING_NOTICE } from "./quickMix.ts";

export interface QuickMixTimingStrategy {
  useNeutralProcessing: boolean;
  confirmNeutralSettings: boolean;
  timingNotice: string;
  direction: PitchTimeDirectionPlan;
}

export function buildQuickMixTimingStrategy(params: {
  vocalBpm: number | null;
  beatBpm: number | null;
  pitchShiftSemitones: number | null;
  librosaUsed: boolean;
}): QuickMixTimingStrategy {
  const hasUsableBpm =
    params.librosaUsed &&
    params.vocalBpm !== null &&
    params.beatBpm !== null &&
    params.vocalBpm > 0 &&
    params.beatBpm > 0;

  if (!hasUsableBpm) {
    return {
      useNeutralProcessing: true,
      confirmNeutralSettings: true,
      timingNotice: QUICK_MIX_NEUTRAL_TIMING_NOTICE,
      direction: buildNeutralQuickMixDirection(),
    };
  }

  const ratio = computeTempoStretchRatio(params.vocalBpm, params.beatBpm);
  const percent = computeTempoStretchPercent(ratio);
  const direction = resolveTempoDirection(ratio);
  const pitchShift = params.pitchShiftSemitones ?? 0;

  return {
    useNeutralProcessing: false,
    confirmNeutralSettings: true,
    timingNotice: `Tempo alignment applied from local analysis (vocal ${params.vocalBpm!.toFixed(1)} BPM → beat ${params.beatBpm!.toFixed(1)} BPM). DJ review required.`,
    direction: {
      intentLabel: "Quick Mix",
      vocalTrackLabel: "Vocal source",
      instrumentalTrackLabel: "Beat source",
      sourceBpm: params.vocalBpm,
      targetBpm: params.beatBpm,
      bpmDifference:
        params.vocalBpm !== null && params.beatBpm !== null
          ? Math.abs(params.vocalBpm - params.beatBpm)
          : null,
      tempoStretchRatio: ratio,
      tempoStretchPercent: percent,
      tempoDirection: direction,
      tempoPlanSummary: formatTempoPlanSummary(
        "Vocal source",
        "Beat source",
        percent,
        direction
      ),
      sourceKeyLabel: "Unknown",
      targetKeyLabel: "Unknown",
      sourceCamelot: null,
      targetCamelot: null,
      suggestedPitchShiftSemitones: pitchShift,
      safeRangeWarning: null,
      formantPreservationNote: "Formant preservation recommended when pitch shift is applied.",
      vocalAdjustmentNote: "Quick Mix vocal timing adjustment from detected BPM.",
      instrumentalAdjustmentNote: "Beat source used as tempo anchor.",
      bpmSource: "detected",
      keySource: "unavailable",
      camelotSource: "unavailable",
      limitations: [PLANNING_ONLY_NOTICE],
      djReviewRequired: true,
    },
  };
}

export function buildQuickMixDirectionContext(params: {
  vocalStemArtifactId: string;
  beatStemArtifactId: string;
  strategy: QuickMixTimingStrategy;
}): CombinedPreviewDirectionContext {
  return {
    mashIntent: "vocal_a_over_beat_b",
    intentLabel: "Quick Mix",
    direction: params.strategy.direction,
    sourceVocalSlotId: "trackA",
    targetInstrumentalSlotId: "trackB",
    sourceVocalArtifactId: params.vocalStemArtifactId,
    targetInstrumentalArtifactId: params.beatStemArtifactId,
    alignmentOffsetMs: 0,
  };
}

function buildNeutralQuickMixDirection(): PitchTimeDirectionPlan {
  return {
    intentLabel: "Quick Mix",
    vocalTrackLabel: "Vocal source",
    instrumentalTrackLabel: "Beat source",
    sourceBpm: null,
    targetBpm: null,
    bpmDifference: null,
    tempoStretchRatio: null,
    tempoStretchPercent: null,
    tempoDirection: "unknown",
    tempoPlanSummary: QUICK_MIX_NEUTRAL_TIMING_NOTICE,
    sourceKeyLabel: "Unknown",
    targetKeyLabel: "Unknown",
    sourceCamelot: null,
    targetCamelot: null,
    suggestedPitchShiftSemitones: 0,
    safeRangeWarning: null,
    formantPreservationNote: "Neutral Quick Mix — no automatic pitch shift.",
    vocalAdjustmentNote: "No tempo/key correction applied.",
    instrumentalAdjustmentNote: "Beat source used as-is.",
    bpmSource: "unavailable",
    keySource: "unavailable",
    camelotSource: "unavailable",
    limitations: [PLANNING_ONLY_NOTICE, QUICK_MIX_NEUTRAL_TIMING_NOTICE],
    djReviewRequired: true,
  };
}
