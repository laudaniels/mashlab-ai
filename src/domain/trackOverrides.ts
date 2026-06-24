export type PhraseLengthBars = 4 | 8 | 16;

export type PlanningValueSource = "detected" | "heuristic" | "user_override" | "unavailable";

export interface TrackDjOverrides {
  bpm: number | null;
  key: string | null;
  mode: "major" | "minor" | "unknown" | null;
  camelot: string | null;
  alignmentOffsetSeconds: number | null;
  phraseLengthBars: PhraseLengthBars | null;
  updatedAt: string | null;
}

export const PHRASE_LENGTH_OPTIONS: PhraseLengthBars[] = [4, 8, 16];

export function emptyTrackDjOverrides(): TrackDjOverrides {
  return {
    bpm: null,
    key: null,
    mode: null,
    camelot: null,
    alignmentOffsetSeconds: null,
    phraseLengthBars: null,
    updatedAt: null,
  };
}

export function hasActiveOverrides(overrides: TrackDjOverrides): boolean {
  return (
    overrides.bpm !== null ||
    overrides.key !== null ||
    overrides.mode !== null ||
    overrides.camelot !== null ||
    overrides.alignmentOffsetSeconds !== null ||
    overrides.phraseLengthBars !== null
  );
}

export function formatPlanningSource(source: PlanningValueSource): string {
  switch (source) {
    case "detected":
      return "Detected analysis";
    case "heuristic":
      return "Heuristic estimate";
    case "user_override":
      return "DJ override";
    default:
      return "Unavailable";
  }
}

export function parseCamelotInput(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const match = /^(\d{1,2})([AB])$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(number) || number < 1 || number > 12) {
    return null;
  }

  return `${number}${match[2]}`;
}

export function parseBpmOverride(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 300) {
    return null;
  }

  return Math.round(parsed * 10) / 10;
}

export function parseAlignmentOffset(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 1000) / 1000;
}
