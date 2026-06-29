import type { TrackSessionArtifact } from "./sessionArtifacts.ts";
import { resolvePlanningBpm } from "./sessionArtifacts.ts";
import type { TrackState } from "./types.ts";
import { formatPlanningSource, type PlanningValueSource } from "./trackOverrides.ts";
import { formatPhraseReadiness } from "./beatGrid.ts";

export interface TimelineBeatMarker {
  timeSeconds: number;
  displaySeconds: number;
  kind: "detected";
}

export interface TimelinePhraseRegion {
  startSeconds: number;
  endSeconds: number;
  barIndex: number;
  label: string;
  source: PlanningValueSource;
}

export interface TimelineLaneData {
  slotId: "trackA" | "trackB";
  label: string;
  fileName: string;
  durationSeconds: number | null;
  waveformPeaks: number[];
  bpm: number | null;
  bpmSource: PlanningValueSource;
  beatMarkers: TimelineBeatMarker[];
  phraseRegions: TimelinePhraseRegion[];
  alignmentOffsetSeconds: number | null;
  alignmentSource: PlanningValueSource;
  phraseReadiness: string;
  introVerseDropStatus: "not_implemented";
  limitations: string[];
  hasBeatData: boolean;
}

const MAX_BEAT_MARKERS = 96;
const MAX_PHRASE_REGIONS = 24;

export function buildTimelineLaneData(
  track: TrackState | null,
  artifact: TrackSessionArtifact | null
): TimelineLaneData | null {
  if (!track) {
    return null;
  }

  const grid = artifact?.effectiveBeatGrid ?? null;
  const bpm = resolvePlanningBpm(artifact);
  const alignmentOffsetSeconds = artifact?.overrides.alignmentOffsetSeconds ?? null;
  const alignmentSource: PlanningValueSource =
    alignmentOffsetSeconds !== null ? "user_override" : grid?.beatTimes.length ? "detected" : "unavailable";

  if (!grid || grid.beatCount === 0) {
    return {
      slotId: track.slotId,
      label: track.label,
      fileName: track.file.name,
      durationSeconds: track.inspection?.durationSeconds ?? null,
      waveformPeaks: track.inspection?.waveformPeaks ?? [],
      bpm: bpm.value,
      bpmSource: bpm.source,
      beatMarkers: [],
      phraseRegions: [],
      alignmentOffsetSeconds,
      alignmentSource,
      phraseReadiness: grid ? formatPhraseReadiness(grid) : "Beat analysis unavailable",
      introVerseDropStatus: "not_implemented",
      limitations: grid?.limitations ?? ["Upload and analyze this track to populate beat markers."],
      hasBeatData: false,
    };
  }

  const beatMarkers = buildBeatMarkers(grid.beatTimes, alignmentOffsetSeconds);
  const phraseRegions = buildPhraseRegions(grid, alignmentOffsetSeconds, track.inspection?.durationSeconds ?? null);

  return {
    slotId: track.slotId,
    label: track.label,
    fileName: track.file.name,
    durationSeconds: track.inspection?.durationSeconds ?? null,
    waveformPeaks: track.inspection?.waveformPeaks ?? [],
    bpm: bpm.value,
    bpmSource: bpm.source,
    beatMarkers,
    phraseRegions,
    alignmentOffsetSeconds,
    alignmentSource,
    phraseReadiness: formatPhraseReadiness(grid),
    introVerseDropStatus: "not_implemented",
    limitations: grid.limitations,
    hasBeatData: true,
  };
}

export function formatTimelineSummaryLines(lanes: TimelineLaneData[]): string[] {
  return lanes.map((lane) => {
    const bpmLabel = lane.bpm !== null ? `${lane.bpm} BPM (${formatPlanningSource(lane.bpmSource)})` : "BPM unavailable";
    const beatLabel = lane.hasBeatData ? `${lane.beatMarkers.length} beat markers` : "No beat markers";
    const phraseLabel = lane.phraseRegions.length
      ? `${lane.phraseRegions.length} ${lane.phraseReadiness.toLowerCase().includes("verified") ? "verified" : "heuristic"} phrase windows`
      : "No phrase windows";
    return `${lane.label}: ${bpmLabel} · ${beatLabel} · ${phraseLabel}`;
  });
}

export function timelineDurationSeconds(lanes: TimelineLaneData[]): number {
  const durations = lanes
    .map((lane) => lane.durationSeconds)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (durations.length === 0) {
    return 60;
  }

  return Math.max(...durations, 1);
}

function buildBeatMarkers(
  beatTimes: number[],
  alignmentOffsetSeconds: number | null
): TimelineBeatMarker[] {
  const offset = alignmentOffsetSeconds ?? beatTimes[0] ?? 0;

  return beatTimes.slice(0, MAX_BEAT_MARKERS).map((timeSeconds) => ({
    timeSeconds,
    displaySeconds: Math.max(0, timeSeconds - offset),
    kind: "detected" as const,
  }));
}

function buildPhraseRegions(
  grid: NonNullable<TrackSessionArtifact["effectiveBeatGrid"]>,
  alignmentOffsetSeconds: number | null,
  durationSeconds: number | null
): TimelinePhraseRegion[] {
  if (!grid.phrasePlan || grid.phraseMarkers.length === 0) {
    return [];
  }

  const offset = alignmentOffsetSeconds ?? grid.beatTimes[0] ?? 0;
  const phraseLengthSeconds =
    grid.bpm && grid.bpm > 0
      ? (grid.phrasePlan.phraseLengthBeats * 60) / grid.bpm
      : null;

  if (phraseLengthSeconds === null) {
    return [];
  }

  const source: PlanningValueSource =
    grid.phraseEvidenceVerified || grid.phraseStatus === "implemented"
      ? "detected"
      : grid.phraseStatus === "heuristic"
        ? "heuristic"
        : "unavailable";

  const regionLabelPrefix =
    grid.phraseEvidenceVerified || grid.phraseStatus === "implemented" ? "Verified phrase" : "Heuristic phrase";

  return grid.phrasePlan.phraseStartTimes.slice(0, MAX_PHRASE_REGIONS).map((startTimeSeconds, barIndex) => {
    const startSeconds = Math.max(0, startTimeSeconds - offset);
    const endSeconds =
      durationSeconds !== null
        ? Math.min(startSeconds + phraseLengthSeconds, durationSeconds)
        : startSeconds + phraseLengthSeconds;

    return {
      startSeconds,
      endSeconds,
      barIndex,
      label: `${regionLabelPrefix} ${barIndex + 1}`,
      source,
    };
  });
}
