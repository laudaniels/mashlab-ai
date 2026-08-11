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
      customTargetBpm: null,
      bpmDifference:
        params.vocalBpm !== null && params.beatBpm !== null
          ? Math.abs(params.vocalBpm - params.beatBpm)
          : null,
      tempoStretchRatio: ratio,
      tempoStretchPercent: percent,
      tempoDirection: direction,
      instrumentalTempoStretchRatio: 1.0,
      instrumentalTempoStretchPercent: 0,
      instrumentalTempoDirection: "none",
      tempoPlanSummary: formatTempoPlanSummary(
        "Vocal source",
        "Beat source",
        percent,
        direction
      ),
      tempoRatioWarning: null,
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
  alignmentOffsetMs?: number;
}): CombinedPreviewDirectionContext {
  return {
    mashIntent: "vocal_a_over_beat_b",
    intentLabel: "Quick Mix",
    direction: params.strategy.direction,
    sourceVocalSlotId: "trackA",
    targetInstrumentalSlotId: "trackB",
    sourceVocalArtifactId: params.vocalStemArtifactId,
    targetInstrumentalArtifactId: params.beatStemArtifactId,
    alignmentOffsetMs: params.alignmentOffsetMs ?? 0,
  };
}

export function buildQuickMixTimingStrategyFromBrain(params: {
  vocalBpm: number | null;
  beatBpm: number | null;
  tempoRatio: number | null;
  pitchShiftSemitones: number | null;
  planSummary: {
    tempo_label: string;
    key_label: string;
    warnings: string[];
    score: number;
    confidence_tier: string;
  } | null;
  librosaUsed: boolean;
}): QuickMixTimingStrategy {
  const hasBrainPlan =
    params.tempoRatio !== null &&
    params.tempoRatio > 0 &&
    params.librosaUsed &&
    params.vocalBpm !== null &&
    params.beatBpm !== null;

  if (!hasBrainPlan) {
    return buildQuickMixTimingStrategy({
      vocalBpm: params.vocalBpm,
      beatBpm: params.beatBpm,
      pitchShiftSemitones: params.pitchShiftSemitones,
      librosaUsed: params.librosaUsed,
    });
  }

  const ratio = params.tempoRatio!;
  const percent = computeTempoStretchPercent(ratio);
  const direction = resolveTempoDirection(ratio);
  const pitchShift = params.pitchShiftSemitones ?? 0;
  const tier = params.planSummary?.confidence_tier ?? "medium";
  const score = params.planSummary?.score ?? 0;

  return {
    useNeutralProcessing: false,
    confirmNeutralSettings: true,
    timingNotice: `Remix Brain plan applied (${tier} confidence, score ${score.toFixed(0)}/100). ${params.planSummary?.tempo_label ?? "Tempo aligned."} DJ review required.`,
    direction: {
      intentLabel: "Quick Mix",
      vocalTrackLabel: "Vocal source",
      instrumentalTrackLabel: "Beat source",
      sourceBpm: params.vocalBpm,
      targetBpm: params.beatBpm,
      customTargetBpm: null,
      bpmDifference:
        params.vocalBpm !== null && params.beatBpm !== null
          ? Math.abs(params.vocalBpm - params.beatBpm)
          : null,
      tempoStretchRatio: ratio,
      tempoStretchPercent: percent,
      tempoDirection: direction,
      instrumentalTempoStretchRatio: 1.0,
      instrumentalTempoStretchPercent: 0,
      instrumentalTempoDirection: "none",
      tempoPlanSummary:
        params.planSummary?.tempo_label ??
        formatTempoPlanSummary("Vocal source", "Beat source", percent, direction),
      tempoRatioWarning: null,
      sourceKeyLabel: params.planSummary?.key_label ?? "Unknown",
      targetKeyLabel: params.planSummary?.key_label ?? "Unknown",
      sourceCamelot: null,
      targetCamelot: null,
      suggestedPitchShiftSemitones: pitchShift,
      safeRangeWarning:
        params.planSummary?.warnings.find((line) => /pitch|key/i.test(line)) ?? null,
      formantPreservationNote: "Formant preservation recommended when pitch shift is applied.",
      vocalAdjustmentNote: "Remix Brain anchor-based vocal placement.",
      instrumentalAdjustmentNote: "Beat source used as tempo anchor.",
      bpmSource: "detected",
      keySource: "detected",
      camelotSource: "detected",
      limitations: [PLANNING_ONLY_NOTICE],
      djReviewRequired: true,
    },
  };
}

function buildNeutralQuickMixDirection(): PitchTimeDirectionPlan {
  return {
    intentLabel: "Quick Mix",
    vocalTrackLabel: "Vocal source",
    instrumentalTrackLabel: "Beat source",
    sourceBpm: null,
    targetBpm: null,
    customTargetBpm: null,
    bpmDifference: null,
    tempoStretchRatio: null,
    tempoStretchPercent: null,
    tempoDirection: "unknown",
    instrumentalTempoStretchRatio: null,
    instrumentalTempoStretchPercent: null,
    instrumentalTempoDirection: "unknown",
    tempoPlanSummary: QUICK_MIX_NEUTRAL_TIMING_NOTICE,
    tempoRatioWarning: null,
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
