import type { BeatAnalysisResult } from "../engines/contracts.ts";

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
  options: { jobComplete: boolean } = { jobComplete: false }
): BeatGridModel {
  if (!beat || !options.jobComplete || beat.beatCount === 0) {
    return emptyBeatGrid(
      beat
        ? [
            ...beat.limitations,
            beat.beatCount === 0 ? "No beat times available for grid planning." : "Beat analysis incomplete.",
          ]
        : ["Beat analysis unavailable."]
    );
  }

  const phrasePlan = planHeuristicPhrases(beat.beatTimes, beat.bpm);
  const downbeatImplemented = beat.downbeatStatus === "implemented";

  return {
    bpm: beat.bpm,
    beatTimes: beat.beatTimes,
    beatCount: beat.beatCount,
    estimatedFirstDownbeat: downbeatImplemented ? beat.beatTimes[0] ?? null : null,
    downbeatTimes: downbeatImplemented ? beat.beatTimes : [],
    downbeatStatus: downbeatImplemented ? "implemented" : "not_implemented",
    phraseMarkers: phrasePlan ? phraseMarkersFromPlan(phrasePlan) : [],
    phrasePlan,
    phraseStatus: phrasePlan ? "heuristic" : "unavailable",
    confidence: beat.bpmConfidence,
    estimateStatus: phrasePlan ? "heuristic" : "available",
    method: beat.method,
    limitations: [...beat.limitations, ...(phrasePlan ? phrasePlan.limitations : ["Phrase planning unavailable without enough detected beats."])],
  };
}

export function planHeuristicPhrases(
  beatTimes: number[],
  bpm: number | null
): HeuristicPhrasePlan | null {
  const phraseLengthBars = 8;
  const phraseLengthBeats = 32;

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
    return `Heuristic ${grid.phrasePlan?.phraseStartTimes.length ?? 0} phrase windows`;
  }

  if (grid.phraseStatus === "not_implemented") {
    return "Phrase planning not implemented";
  }

  return "Phrase planning unavailable";
}
