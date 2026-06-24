import type { BeatAnalysisResult, KeyAnalysisResult } from "../engines/contracts.ts";
import type { MashTrackJob } from "./jobs.ts";
import { buildBeatGridFromAnalysis, formatPhraseReadiness } from "./beatGrid.ts";
import {
  buildMashupPlanningSummary,
  keyProfileFromAnalysis,
  type MashupPlanningSummary,
} from "./harmonicPlanning.ts";
import type { SlotId } from "./types.ts";

export function extractBeatResult(job: MashTrackJob | null): BeatAnalysisResult | null {
  const step = job?.steps.find((candidate) => candidate.id === "beat");
  if (!step || step.state !== "complete") {
    return null;
  }

  return step.resultData as BeatAnalysisResult | null;
}

export function extractKeyResult(job: MashTrackJob | null): KeyAnalysisResult | null {
  const step = job?.steps.find((candidate) => candidate.id === "key");
  if (!step || step.state !== "complete") {
    return null;
  }

  return step.resultData as KeyAnalysisResult | null;
}

export function buildPairPlanningSummary(params: {
  trackALabel: string;
  trackBLabel: string;
  trackAJob: MashTrackJob | null;
  trackBJob: MashTrackJob | null;
}): MashupPlanningSummary | null {
  const beatA = extractBeatResult(params.trackAJob);
  const beatB = extractBeatResult(params.trackBJob);
  const keyA = extractKeyResult(params.trackAJob);
  const keyB = extractKeyResult(params.trackBJob);

  if (!params.trackAJob || !params.trackBJob) {
    return null;
  }

  const gridA = buildBeatGridFromAnalysis(beatA, { jobComplete: Boolean(beatA) });
  const gridB = buildBeatGridFromAnalysis(beatB, { jobComplete: Boolean(beatB) });
  const profileA = keyProfileFromAnalysis(keyA, Boolean(keyA));
  const profileB = keyProfileFromAnalysis(keyB, Boolean(keyB));

  const summary = buildMashupPlanningSummary({
    trackALabel: params.trackALabel,
    trackBLabel: params.trackBLabel,
    trackABpm: gridA.bpm,
    trackBBpm: gridB.bpm,
    trackAKey: profileA,
    trackBKey: profileB,
    phraseReadinessA: formatPhraseReadiness(gridA),
    phraseReadinessB: formatPhraseReadiness(gridB),
  });

  summary.trackA.beatCount = gridA.beatCount;
  summary.trackB.beatCount = gridB.beatCount;

  return summary;
}

export function trackJobHasPlanningInputs(job: MashTrackJob | null): boolean {
  return Boolean(job && job.steps.some((step) => step.id === "beat" || step.id === "key"));
}

export function slotLabel(slotId: SlotId): string {
  return slotId === "trackA" ? "Track A" : "Track B";
}
