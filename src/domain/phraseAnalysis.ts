import type { BeatGridModel, HeuristicPhrasePlan, PhraseMarker } from "./beatGrid.ts";
import type { PhraseLengthBars } from "./trackOverrides.ts";

export type PhraseAnalysisApiBasis =
  | "verified_downbeat"
  | "verified_phrase"
  | "heuristic_from_beats"
  | "unavailable";

export type PhraseAnalysisMethodPreference = "auto" | "heuristic" | "essentia" | "beatnet" | "madmom";

export const PHRASE_ANALYSIS_DJ_REVIEW_NOTICE = "DJ review required — phrase/downbeat evidence is planning aid only.";

export const PHRASE_EVIDENCE_PRIORITY: readonly string[] = [
  "dj_override",
  "verified_phrase",
  "verified_downbeat",
  "heuristic_phrase_markers",
  "heuristic_from_beats",
  "detected_beats",
  "unavailable",
];

export interface PhraseAnalysisResult {
  methodUsed: string;
  phraseBasis: PhraseAnalysisApiBasis;
  beatTimes: number[];
  downbeatTimes: number[];
  phraseStartTimes: number[];
  phraseLengthBars: number | null;
  confidence: number | null;
  bpm: number | null;
  limitations: string[];
  djReviewRequired: true;
  fileName: string;
}

export interface PhraseEvidenceTraceability {
  phraseEvidenceMethod: string | null;
  phraseBasis: string;
  phraseEvidenceVerified: boolean;
  phraseConfidence: number | null;
  phraseEvidenceLimitations: string[];
}

export function mapApiPhraseBasisToPlanningBasis(
  basis: PhraseAnalysisApiBasis
): import("./arrangementPlanning.ts").PhraseBasis {
  switch (basis) {
    case "verified_phrase":
      return "verified_phrase";
    case "verified_downbeat":
      return "verified_downbeat";
    case "heuristic_from_beats":
      return "heuristic_from_beats";
    default:
      return "unavailable";
  }
}

export function phraseBasisPriorityRank(basis: string): number {
  const index = PHRASE_EVIDENCE_PRIORITY.indexOf(basis);
  return index === -1 ? PHRASE_EVIDENCE_PRIORITY.length : index;
}

export function preferPhraseBasis(current: string, candidate: string): string {
  return phraseBasisPriorityRank(candidate) < phraseBasisPriorityRank(current) ? candidate : current;
}

export function isVerifiedPhraseBasis(basis: string): boolean {
  return basis === "verified_phrase" || basis === "verified_downbeat";
}

export function formatPhraseEvidenceLabel(basis: string, _method: string | null): string {
  switch (basis) {
    case "verified_phrase":
      return "Verified phrase";
    case "verified_downbeat":
      return "Verified downbeat";
    case "heuristic_phrase_markers":
    case "heuristic_from_beats":
      return "Heuristic";
    case "dj_override":
      return "DJ override";
    case "detected_beats":
      return "Detected beats only";
    default:
      return "Unavailable";
  }
}

export function formatPhraseAnalysisSummary(result: PhraseAnalysisResult): string[] {
  const lines = [
    `Method: ${result.methodUsed}`,
    `Phrase basis: ${formatPhraseEvidenceLabel(result.phraseBasis, result.methodUsed)}`,
    `Phrase windows: ${result.phraseStartTimes.length}`,
    `Downbeats: ${result.downbeatTimes.length > 0 ? result.downbeatTimes.length : "none detected"}`,
  ];
  if (result.confidence !== null) {
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  }
  lines.push(PHRASE_ANALYSIS_DJ_REVIEW_NOTICE);
  return lines;
}

export function formatMissingPhraseDependency(capability: {
  label: string;
  status: string;
  message: string;
}): string {
  return `${capability.label} (${capability.status}): ${capability.message}`;
}

export function phraseAnalysisClaimsVerifiedWithoutEvidence(result: PhraseAnalysisResult): boolean {
  if (result.phraseBasis === "verified_phrase" || result.phraseBasis === "verified_downbeat") {
    if (result.phraseBasis === "verified_phrase" && result.phraseStartTimes.length === 0) {
      return true;
    }
    if (result.phraseBasis === "verified_downbeat" && result.downbeatTimes.length === 0) {
      return true;
    }
  }
  return false;
}

export function buildPhraseEvidenceTraceability(
  grid: BeatGridModel | null,
  phraseAnalysis: PhraseAnalysisResult | null
): PhraseEvidenceTraceability {
  const basis =
    phraseAnalysis?.phraseBasis && phraseAnalysis.phraseBasis !== "unavailable"
      ? mapApiPhraseBasisToPlanningBasis(phraseAnalysis.phraseBasis)
      : grid?.phraseEvidenceBasis ?? "unavailable";

  return {
    phraseEvidenceMethod: phraseAnalysis?.methodUsed ?? grid?.phraseEvidenceMethod ?? null,
    phraseBasis: basis,
    phraseEvidenceVerified: isVerifiedPhraseBasis(basis),
    phraseConfidence: phraseAnalysis?.confidence ?? grid?.phraseConfidence ?? null,
    phraseEvidenceLimitations: [
      ...(phraseAnalysis?.limitations ?? []),
      ...(grid?.limitations ?? []),
      PHRASE_ANALYSIS_DJ_REVIEW_NOTICE,
    ],
  };
}

export function applyPhraseAnalysisToBeatGrid(
  grid: BeatGridModel,
  phraseAnalysis: PhraseAnalysisResult,
  phraseLengthBars: PhraseLengthBars = 8
): BeatGridModel {
  const basis = phraseAnalysis.phraseBasis;
  const limitations = [...grid.limitations, ...phraseAnalysis.limitations];

  if (basis === "verified_phrase" && phraseAnalysis.phraseStartTimes.length > 0) {
    const lengthBars = phraseAnalysis.phraseLengthBars ?? phraseLengthBars;
    const lengthBeats = lengthBars * 4;
    const markers: PhraseMarker[] = phraseAnalysis.phraseStartTimes.map((startTimeSeconds, index) => ({
      startTimeSeconds,
      phraseLengthBars: lengthBars,
      phraseLengthBeats: lengthBeats,
      barIndexFromStart: index,
      kind: "verified" as const,
    }));
    const plan: HeuristicPhrasePlan = {
      phraseLengthBars: lengthBars,
      phraseLengthBeats: lengthBeats,
      phraseStartTimes: phraseAnalysis.phraseStartTimes,
      method: phraseAnalysis.methodUsed,
      status: "heuristic",
      limitations,
      djReviewRequired: true,
    };
    return {
      ...grid,
      beatTimes: phraseAnalysis.beatTimes.length > 0 ? phraseAnalysis.beatTimes : grid.beatTimes,
      beatCount: phraseAnalysis.beatTimes.length > 0 ? phraseAnalysis.beatTimes.length : grid.beatCount,
      bpm: phraseAnalysis.bpm ?? grid.bpm,
      downbeatTimes: phraseAnalysis.downbeatTimes,
      downbeatStatus: phraseAnalysis.downbeatTimes.length > 0 ? "implemented" : grid.downbeatStatus,
      phraseMarkers: markers,
      phrasePlan: plan,
      phraseStatus: "implemented",
      phraseEvidenceBasis: "verified_phrase",
      phraseEvidenceMethod: phraseAnalysis.methodUsed,
      phraseEvidenceVerified: true,
      phraseConfidence: phraseAnalysis.confidence,
      estimateStatus: "available",
      method: phraseAnalysis.methodUsed,
      limitations,
    };
  }

  if (basis === "verified_downbeat" && phraseAnalysis.downbeatTimes.length > 0) {
    return {
      ...grid,
      downbeatTimes: phraseAnalysis.downbeatTimes,
      downbeatStatus: "implemented",
      estimatedFirstDownbeat: phraseAnalysis.downbeatTimes[0] ?? null,
      phraseEvidenceBasis: "verified_downbeat",
      phraseEvidenceMethod: phraseAnalysis.methodUsed,
      phraseEvidenceVerified: true,
      phraseConfidence: phraseAnalysis.confidence,
      limitations,
    };
  }

  if (basis === "heuristic_from_beats" && phraseAnalysis.phraseStartTimes.length > 0) {
    const lengthBars = phraseAnalysis.phraseLengthBars ?? phraseLengthBars;
    const lengthBeats = lengthBars * 4;
    const markers: PhraseMarker[] = phraseAnalysis.phraseStartTimes.map((startTimeSeconds, index) => ({
      startTimeSeconds,
      phraseLengthBars: lengthBars,
      phraseLengthBeats: lengthBeats,
      barIndexFromStart: index,
      kind: "heuristic" as const,
    }));
    const plan: HeuristicPhrasePlan = {
      phraseLengthBars: lengthBars,
      phraseLengthBeats: lengthBeats,
      phraseStartTimes: phraseAnalysis.phraseStartTimes,
      method: phraseAnalysis.methodUsed,
      status: "heuristic",
      limitations,
      djReviewRequired: true,
    };
    return {
      ...grid,
      beatTimes: phraseAnalysis.beatTimes.length > 0 ? phraseAnalysis.beatTimes : grid.beatTimes,
      beatCount: phraseAnalysis.beatTimes.length > 0 ? phraseAnalysis.beatTimes.length : grid.beatCount,
      bpm: phraseAnalysis.bpm ?? grid.bpm,
      downbeatTimes: [],
      downbeatStatus: "not_implemented",
      phraseMarkers: markers,
      phrasePlan: plan,
      phraseStatus: "heuristic",
      phraseEvidenceBasis: "heuristic_from_beats",
      phraseEvidenceMethod: phraseAnalysis.methodUsed,
      phraseEvidenceVerified: false,
      phraseConfidence: phraseAnalysis.confidence,
      estimateStatus: "heuristic",
      method: phraseAnalysis.methodUsed,
      limitations,
    };
  }

  return {
    ...grid,
    phraseEvidenceMethod: phraseAnalysis.methodUsed,
    phraseEvidenceBasis: "unavailable",
    phraseEvidenceVerified: false,
    limitations,
  };
}

export function validatePhraseAnalysisRequest(params: {
  phraseLengthBars: number;
  method: string;
}): string[] {
  const errors: string[] = [];
  if (![4, 8, 16].includes(params.phraseLengthBars)) {
    errors.push("phrase_length_bars must be 4, 8, or 16.");
  }
  if (!["auto", "heuristic", "essentia", "beatnet", "madmom"].includes(params.method)) {
    errors.push("method must be auto, heuristic, essentia, beatnet, or madmom.");
  }
  return errors;
}

export function phraseAnalysisFromApiResult(
  result: import("../lib/localEngine/types.ts").PhraseAnalysisResultPayload
): PhraseAnalysisResult {
  return {
    fileName: result.file_name,
    methodUsed: result.method_used,
    phraseBasis: result.phrase_basis,
    beatTimes: result.beat_times,
    downbeatTimes: result.downbeat_times,
    phraseStartTimes: result.phrase_start_times,
    phraseLengthBars: result.phrase_length_bars,
    confidence: result.confidence,
    bpm: result.bpm,
    limitations: result.limitations,
    djReviewRequired: true,
  };
}
