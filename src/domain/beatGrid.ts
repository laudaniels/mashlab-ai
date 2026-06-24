import type { BeatAnalysisResult } from "../engines/contracts.ts";
import type { PhraseLengthBars, TrackDjOverrides } from "./trackOverrides.ts";

export type BeatEstimateStatus = "available" | "heuristic" | "not_implemented" | "unavailable";

export interface PhraseMarker {
  startTimeSeconds: number;
  phraseLengthBars: number;
  phraseLengthBeats: number;
  barIndexFromStart: number;
  kind: "heuristic";
}

export interface HeuristicPhrasePlan {
  phraseLengthBars: number;
  phraseLengthBeats: number;
  phraseStartTimes: number[];
  method: "heuristic_from_detected_beats";
  status: "heuristic";
  limitations: string[];
  djReviewRequired: true;
}

export interface BeatGridModel {
  bpm: number | null;
  beatTimes: number[];
  beatCount: number;
  estimatedFirstDownbeat: number | null;
  downbeatTimes: number[];
  downbeatStatus: "not_implemented" | "implemented" | "heuristic";
  phraseMarkers: PhraseMarker[];
  phrasePlan: HeuristicPhrasePlan | null;
  phraseStatus: "not_implemented" | "heuristic" | "implemented" | "unavailable";
  confidence: number | null;
  estimateStatus: BeatEstimateStatus;
  method: string | null;
  limitations: string[];
}

const HEURISTIC_PHRASE_LIMITATIONS = [
  "Heuristic only; assumes the first detected beat equals bar 1 downbeat.",
  "This is not true downbeat detection. DJ review required.",
  "BeatNet+ / Essentia downbeat detection remains a future upgrade.",
];

export function buildBeatGridFromAnalysis(
  beat: BeatAnalysisResult | null,
  options: {
    jobComplete?: boolean;
    phraseLengthBars?: PhraseLengthBars;
    alignmentOffsetSeconds?: number | null;
  } = {}
): BeatGridModel {
  const jobComplete = options.jobComplete ?? false;

  if (!beat || !jobComplete || beat.beatCount === 0) {
    return emptyBeatGrid(
      beat
        ? [
            ...beat.limitations,
            beat.beatCount === 0 ? "No beat times available for grid planning." : "Beat analysis incomplete.",
          ]
        : ["Beat analysis unavailable."]
    );
  }

  const alignedBeatTimes = alignBeatTimesForPlanning(beat.beatTimes, options.alignmentOffsetSeconds ?? null);
  const phraseLengthBars = options.phraseLengthBars ?? 8;
  const phrasePlan = planHeuristicPhrases(alignedBeatTimes, beat.bpm, phraseLengthBars);
  const downbeatImplemented = beat.downbeatStatus === "implemented";

  return {
    bpm: beat.bpm,
    beatTimes: alignedBeatTimes,
    beatCount: alignedBeatTimes.length,
    estimatedFirstDownbeat: downbeatImplemented ? alignedBeatTimes[0] ?? null : null,
    downbeatTimes: downbeatImplemented ? alignedBeatTimes : [],
    downbeatStatus: downbeatImplemented ? "implemented" : "not_implemented",
    phraseMarkers: phrasePlan ? phraseMarkersFromPlan(phrasePlan) : [],
    phrasePlan,
    phraseStatus: phrasePlan ? "heuristic" : "unavailable",
    confidence: beat.bpmConfidence,
    estimateStatus: phrasePlan ? "heuristic" : "available",
    method: beat.method,
    limitations: [
      ...beat.limitations,
      ...(options.alignmentOffsetSeconds !== null && options.alignmentOffsetSeconds !== undefined
        ? ["Alignment offset applied for planning. DJ override — not AI-detected downbeat."]
        : []),
      ...(phrasePlan ? phrasePlan.limitations : ["Phrase planning unavailable without enough detected beats."]),
    ],
  };
}

export function buildEffectiveBeatGrid(
  grid: BeatGridModel,
  overrides: TrackDjOverrides
): BeatGridModel {
  const bpm = overrides.bpm ?? grid.bpm;
  const beatTimes = grid.beatTimes;

  if (beatTimes.length === 0 && grid.beatCount === 0 && bpm === null) {
    return grid;
  }

  const phraseLengthBars = overrides.phraseLengthBars ?? grid.phrasePlan?.phraseLengthBars ?? 8;
  const phrasePlan = planHeuristicPhrases(
    beatTimes,
    bpm,
    phraseLengthBars as PhraseLengthBars
  );

  const limitations = [...grid.limitations];
  if (overrides.bpm !== null) {
    limitations.push("BPM uses DJ override value.");
  }
  if (overrides.alignmentOffsetSeconds !== null) {
    limitations.push("Beat alignment uses DJ override offset.");
  }
  if (overrides.phraseLengthBars !== null) {
    limitations.push(`Phrase windows use DJ override length (${overrides.phraseLengthBars} bars).`);
  }

  return {
    ...grid,
    bpm,
    beatTimes,
    beatCount: beatTimes.length,
    phraseMarkers: phrasePlan ? phraseMarkersFromPlan(phrasePlan) : [],
    phrasePlan,
    phraseStatus: phrasePlan ? "heuristic" : grid.phraseStatus,
    estimateStatus: overrides.bpm !== null || overrides.alignmentOffsetSeconds !== null ? "heuristic" : grid.estimateStatus,
    limitations,
  };
}

export function planHeuristicPhrases(
  beatTimes: number[],
  bpm: number | null,
  phraseLengthBars: PhraseLengthBars | number = 8
): HeuristicPhrasePlan | null {
  const phraseLengthBeats = phraseLengthBars * 4;

  if (beatTimes.length < phraseLengthBeats) {
    return null;
  }

  if (bpm === null || !Number.isFinite(bpm)) {
    return null;
  }

  const phraseStartTimes: number[] = [];
  for (let index = 0; index < beatTimes.length; index += phraseLengthBeats) {
    const startTime = beatTimes[index];
    if (typeof startTime === "number" && Number.isFinite(startTime)) {
      phraseStartTimes.push(startTime);
    }
  }

  if (phraseStartTimes.length === 0) {
    return null;
  }

  return {
    phraseLengthBars,
    phraseLengthBeats,
    phraseStartTimes,
    method: "heuristic_from_detected_beats",
    status: "heuristic",
    limitations: HEURISTIC_PHRASE_LIMITATIONS,
    djReviewRequired: true,
  };
}

export function alignBeatTimesForPlanning(
  beatTimes: number[],
  alignmentOffsetSeconds: number | null
): number[] {
  if (alignmentOffsetSeconds === null || !Number.isFinite(alignmentOffsetSeconds)) {
    return beatTimes;
  }

  const startIndex = beatTimes.findIndex((time) => time >= alignmentOffsetSeconds);
  if (startIndex === -1) {
    return [];
  }

  const anchor = beatTimes[startIndex] ?? alignmentOffsetSeconds;
  return beatTimes.slice(startIndex).map((time) => roundMillis(time - anchor));
}

function phraseMarkersFromPlan(plan: HeuristicPhrasePlan): PhraseMarker[] {
  return plan.phraseStartTimes.map((startTimeSeconds, barIndexFromStart) => ({
    startTimeSeconds,
    phraseLengthBars: plan.phraseLengthBars,
    phraseLengthBeats: plan.phraseLengthBeats,
    barIndexFromStart,
    kind: "heuristic" as const,
  }));
}

function emptyBeatGrid(limitations: string[]): BeatGridModel {
  return {
    bpm: null,
    beatTimes: [],
    beatCount: 0,
    estimatedFirstDownbeat: null,
    downbeatTimes: [],
    downbeatStatus: "not_implemented",
    phraseMarkers: [],
    phrasePlan: null,
    phraseStatus: "unavailable",
    confidence: null,
    estimateStatus: "unavailable",
    method: null,
    limitations,
  };
}

export function formatPhraseReadiness(grid: BeatGridModel): string {
  if (grid.phraseStatus === "heuristic") {
    return `Heuristic ${grid.phrasePlan?.phraseStartTimes.length ?? 0} phrase windows · DJ review required`;
  }

  if (grid.phraseStatus === "not_implemented") {
    return "Phrase planning not implemented";
  }

  return "Phrase planning unavailable";
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}
