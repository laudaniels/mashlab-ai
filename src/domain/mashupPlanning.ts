import type { BeatAnalysisResult, KeyAnalysisResult } from "../engines/contracts.ts";
import type { MashTrackJob } from "./jobs.ts";
import { buildBeatGridFromAnalysis, formatPhraseReadiness } from "./beatGrid.ts";
import {
  buildMashupPlanningSummary,
  effectiveKeyToProfile,
  type MashupPlanningSummary,
} from "./harmonicPlanning.ts";
import {
  resolvePlanningBpm,
  type SessionArtifactStore,
  type TrackSessionArtifact,
} from "./sessionArtifacts.ts";
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
  trackAJob?: MashTrackJob | null;
  trackBJob?: MashTrackJob | null;
  artifactStore?: SessionArtifactStore | null;
}): MashupPlanningSummary | null {
  const artifactA = params.artifactStore?.tracks.trackA ?? null;
  const artifactB = params.artifactStore?.tracks.trackB ?? null;

  if (artifactA && artifactB) {
    return buildPairPlanningFromArtifacts({
      trackALabel: params.trackALabel,
      trackBLabel: params.trackBLabel,
      artifactA,
      artifactB,
    });
  }

  const trackAJob = params.trackAJob ?? null;
  const trackBJob = params.trackBJob ?? null;

  if (!trackAJob || !trackBJob) {
    return null;
  }

  const beatA = extractBeatResult(trackAJob);
  const beatB = extractBeatResult(trackBJob);
  const keyA = extractKeyResult(trackAJob);
  const keyB = extractKeyResult(trackBJob);

  const gridA = buildBeatGridFromAnalysis(beatA, { jobComplete: Boolean(beatA) });
  const gridB = buildBeatGridFromAnalysis(beatB, { jobComplete: Boolean(beatB) });

  const summary = buildMashupPlanningSummary({
    trackALabel: params.trackALabel,
    trackBLabel: params.trackBLabel,
    trackABpm: gridA.bpm,
    trackBBpm: gridB.bpm,
    trackABpmSource: gridA.bpm !== null ? "detected" : "unavailable",
    trackBBpmSource: gridB.bpm !== null ? "detected" : "unavailable",
    trackAKey: effectiveKeyToProfile({
      key: keyA?.key ?? null,
      mode: keyA?.mode ?? "unknown",
      camelot: keyA?.camelot ?? null,
      confidence: keyA?.confidence ?? null,
      method: keyA?.method ?? null,
      keySource: keyA?.key ? "detected" : "unavailable",
      camelotSource: keyA?.camelot ? "detected" : "unavailable",
      isUserSupplied: false,
    }),
    trackBKey: effectiveKeyToProfile({
      key: keyB?.key ?? null,
      mode: keyB?.mode ?? "unknown",
      camelot: keyB?.camelot ?? null,
      confidence: keyB?.confidence ?? null,
      method: keyB?.method ?? null,
      keySource: keyB?.key ? "detected" : "unavailable",
      camelotSource: keyB?.camelot ? "detected" : "unavailable",
      isUserSupplied: false,
    }),
    phraseReadinessA: formatPhraseReadiness(gridA),
    phraseReadinessB: formatPhraseReadiness(gridB),
  });

  summary.trackA.beatCount = gridA.beatCount;
  summary.trackB.beatCount = gridB.beatCount;

  return summary;
}

export function buildPairPlanningFromArtifacts(params: {
  trackALabel: string;
  trackBLabel: string;
  artifactA: TrackSessionArtifact;
  artifactB: TrackSessionArtifact;
}): MashupPlanningSummary {
  const gridA = params.artifactA.effectiveBeatGrid;
  const gridB = params.artifactB.effectiveBeatGrid;
  const bpmA = resolvePlanningBpm(params.artifactA);
  const bpmB = resolvePlanningBpm(params.artifactB);

  const summary = buildMashupPlanningSummary({
    trackALabel: params.trackALabel,
    trackBLabel: params.trackBLabel,
    trackABpm: bpmA.value,
    trackBBpm: bpmB.value,
    trackABpmSource: bpmA.source,
    trackBBpmSource: bpmB.source,
    trackAKey: params.artifactA.effectiveKeyProfile ?? {
      key: null,
      mode: "unknown",
      camelot: null,
      confidence: null,
      method: null,
      keySource: "unavailable",
      camelotSource: "unavailable",
      isUserSupplied: false,
    },
    trackBKey: params.artifactB.effectiveKeyProfile ?? {
      key: null,
      mode: "unknown",
      camelot: null,
      confidence: null,
      method: null,
      keySource: "unavailable",
      camelotSource: "unavailable",
      isUserSupplied: false,
    },
    phraseReadinessA: gridA ? formatPhraseReadiness(gridA) : "Phrase planning unavailable",
    phraseReadinessB: gridB ? formatPhraseReadiness(gridB) : "Phrase planning unavailable",
  });

  summary.trackA.beatCount = gridA?.beatCount ?? null;
  summary.trackB.beatCount = gridB?.beatCount ?? null;

  return summary;
}

export function trackJobHasPlanningInputs(job: MashTrackJob | null): boolean {
  return Boolean(job && job.steps.some((step) => step.id === "beat" || step.id === "key"));
}

export function slotLabel(slotId: SlotId): string {
  return slotId === "trackA" ? "Track A" : "Track B";
}
