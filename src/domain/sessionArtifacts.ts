import type { BeatAnalysisResult, KeyAnalysisResult } from "../engines/contracts.ts";
import type { MashTrackJob } from "./jobs.ts";
import {
  buildBeatGridFromAnalysis,
  buildEffectiveBeatGrid,
  type BeatGridModel,
} from "./beatGrid.ts";
import { applyPhraseAnalysisToBeatGrid, type PhraseAnalysisResult } from "./phraseAnalysis.ts";
import { buildEffectiveKeyProfile, type EffectiveKeyProfile } from "./harmonicPlanning.ts";
import type { AudioInspection, SlotId } from "./types.ts";
import {
  emptyTrackDjOverrides,
  hasActiveOverrides,
  type PhraseLengthBars,
  type PlanningValueSource,
  type TrackDjOverrides,
} from "./trackOverrides.ts";
import { extractBeatResult, extractKeyResult } from "./mashupPlanning.ts";

export const SESSION_ARTIFACT_VERSION = 1;

export interface FileIdentity {
  name: string;
  sizeBytes: number;
  lastModified: number;
}

export interface StemPreviewArtifactRef {
  artifactId: string;
  updatedAt: string;
}

export interface TrackSessionArtifact {
  version: number;
  sessionId: string;
  slotId: SlotId;
  fileIdentity: FileIdentity;
  inspectionId: string | null;
  browserMetadata: AudioInspection | null;
  serviceMetadata: unknown | null;
  beatAnalysis: BeatAnalysisResult | null;
  keyAnalysis: KeyAnalysisResult | null;
  phraseAnalysis: PhraseAnalysisResult | null;
  beatGrid: BeatGridModel | null;
  effectiveBeatGrid: BeatGridModel | null;
  effectiveKeyProfile: EffectiveKeyProfile | null;
  overrides: TrackDjOverrides;
  stemPreview: StemPreviewArtifactRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionArtifactStore {
  sessionId: string;
  version: number;
  tracks: Record<SlotId, TrackSessionArtifact | null>;
}

export function createSessionArtifactStore(sessionId: string): SessionArtifactStore {
  return {
    sessionId,
    version: SESSION_ARTIFACT_VERSION,
    tracks: {
      trackA: null,
      trackB: null,
    },
  };
}

export function buildFileIdentity(file: File): FileIdentity {
  return {
    name: file.name,
    sizeBytes: file.size,
    lastModified: file.lastModified,
  };
}

export function createTrackArtifact(params: {
  sessionId: string;
  slotId: SlotId;
  file: File;
  inspection: AudioInspection | null;
}): TrackSessionArtifact {
  const timestamp = new Date().toISOString();

  return rebuildTrackArtifact({
    version: SESSION_ARTIFACT_VERSION,
    sessionId: params.sessionId,
    slotId: params.slotId,
    fileIdentity: buildFileIdentity(params.file),
    inspectionId: params.inspection?.id ?? null,
    browserMetadata: params.inspection,
    serviceMetadata: null,
    beatAnalysis: null,
    keyAnalysis: null,
    phraseAnalysis: null,
    beatGrid: null,
    effectiveBeatGrid: null,
    effectiveKeyProfile: null,
    overrides: emptyTrackDjOverrides(),
    stemPreview: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function syncTrackArtifactFromJob(
  artifact: TrackSessionArtifact,
  job: MashTrackJob | null
): TrackSessionArtifact {
  if (!job) {
    return rebuildTrackArtifact({
      ...artifact,
      beatAnalysis: null,
      keyAnalysis: null,
      serviceMetadata: extractMetadataResult(job),
    });
  }

  return rebuildTrackArtifact({
    ...artifact,
    inspectionId: job.inspectionId,
    beatAnalysis: extractBeatResult(job),
    keyAnalysis: extractKeyResult(job),
    serviceMetadata: extractMetadataResult(job),
  });
}

export function updateTrackArtifactOverrides(
  artifact: TrackSessionArtifact,
  patch: Partial<TrackDjOverrides>
): TrackSessionArtifact {
  const overrides: TrackDjOverrides = {
    ...artifact.overrides,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  return rebuildTrackArtifact({
    ...artifact,
    overrides,
  });
}

export function clearTrackArtifactOverrides(artifact: TrackSessionArtifact): TrackSessionArtifact {
  return rebuildTrackArtifact({
    ...artifact,
    overrides: emptyTrackDjOverrides(),
  });
}

export function updateTrackStemPreviewArtifact(
  artifact: TrackSessionArtifact,
  artifactId: string
): TrackSessionArtifact {
  return rebuildTrackArtifact({
    ...artifact,
    stemPreview: {
      artifactId,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function updateTrackPhraseAnalysis(
  artifact: TrackSessionArtifact,
  phraseAnalysis: PhraseAnalysisResult | null
): TrackSessionArtifact {
  return rebuildTrackArtifact({
    ...artifact,
    phraseAnalysis,
  });
}

export function rebuildTrackArtifact(artifact: TrackSessionArtifact): TrackSessionArtifact {
  let beatGrid = buildBeatGridFromAnalysis(artifact.beatAnalysis, {
    jobComplete: Boolean(artifact.beatAnalysis),
    phraseLengthBars: artifact.overrides.phraseLengthBars ?? undefined,
    alignmentOffsetSeconds: artifact.overrides.alignmentOffsetSeconds,
  });

  if (artifact.phraseAnalysis) {
    beatGrid = applyPhraseAnalysisToBeatGrid(
      beatGrid,
      artifact.phraseAnalysis,
      (artifact.overrides.phraseLengthBars ??
        artifact.phraseAnalysis.phraseLengthBars ??
        8) as PhraseLengthBars
    );
  }

  const effectiveBeatGrid = buildEffectiveBeatGrid(beatGrid, artifact.overrides);
  const effectiveKeyProfile = buildEffectiveKeyProfile(artifact.keyAnalysis, artifact.overrides);

  return {
    ...artifact,
    beatGrid,
    effectiveBeatGrid,
    effectiveKeyProfile,
    updatedAt: new Date().toISOString(),
  };
}

export function resolvePlanningBpm(artifact: TrackSessionArtifact | null): {
  value: number | null;
  source: PlanningValueSource;
} {
  if (!artifact) {
    return { value: null, source: "unavailable" };
  }

  if (artifact.overrides.bpm !== null) {
    return { value: artifact.overrides.bpm, source: "user_override" };
  }

  if (artifact.beatAnalysis?.bpm !== null && artifact.beatAnalysis?.bpm !== undefined) {
    return { value: artifact.beatAnalysis.bpm, source: "detected" };
  }

  if (artifact.effectiveBeatGrid?.bpm !== null && artifact.effectiveBeatGrid?.bpm !== undefined) {
    return { value: artifact.effectiveBeatGrid.bpm, source: "detected" };
  }

  return { value: null, source: "unavailable" };
}

export function artifactHasPlanningData(artifact: TrackSessionArtifact | null): boolean {
  if (!artifact) {
    return false;
  }

  return Boolean(
    artifact.beatAnalysis ||
      artifact.keyAnalysis ||
      artifact.browserMetadata ||
      hasActiveOverrides(artifact.overrides)
  );
}

function extractMetadataResult(job: MashTrackJob | null): unknown | null {
  const step = job?.steps.find((candidate) => candidate.id === "metadata");
  if (!step || step.state !== "complete") {
    return null;
  }

  return step.resultData ?? null;
}

export function phraseLengthLabel(bars: PhraseLengthBars | null): string {
  if (bars === null) {
    return "Default (8 bars)";
  }

  return `${bars} bars`;
}
