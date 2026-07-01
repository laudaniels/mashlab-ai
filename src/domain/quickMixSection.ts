import { formatDuration } from "../lib/audioMetadata.ts";
import {
  QUICK_MIX_DURATION_CAP_SECONDS,
  type QuickMixUploadSlot,
} from "./quickMix.ts";

export type QuickMixSectionMode = "first_180" | "custom_start";

export interface QuickMixSectionSelection {
  mode: QuickMixSectionMode;
  /** Resolved start offset in seconds (0 for first 180s). */
  startOffsetSeconds: number;
  /** Processing window length — MVP cap remains 180s. */
  windowSeconds: number;
}

export interface QuickMixSectionDraft {
  mode: QuickMixSectionMode;
  customMinutes: string;
  customSeconds: string;
}

export interface QuickMixSectionSummary {
  slot: QuickMixUploadSlot;
  selection: QuickMixSectionSelection;
  sourceDurationSeconds: number | null;
  outputDurationSeconds: number | null;
}

export const QUICK_MIX_SECTION_LABEL = "Section to use";
export const QUICK_MIX_SECTION_FIRST_180_LABEL = "First 3:00";
export const QUICK_MIX_SECTION_CUSTOM_START_LABEL = "Custom start";
export const QUICK_MIX_SECTION_WINDOW_NOTICE = "MashLab will process 3:00 from this point.";
export const QUICK_MIX_SAME_START_TOGGLE_LABEL = "Use the same start time for both sources";

export function createDefaultQuickMixSectionDraft(): QuickMixSectionDraft {
  return {
    mode: "first_180",
    customMinutes: "0",
    customSeconds: "0",
  };
}

export function createDefaultQuickMixSectionSelection(): QuickMixSectionSelection {
  return {
    mode: "first_180",
    startOffsetSeconds: 0,
    windowSeconds: QUICK_MIX_DURATION_CAP_SECONDS,
  };
}

export function parseQuickMixTimeInput(minutesInput: string, secondsInput: string): number | null {
  const minutes = Number.parseInt(minutesInput.trim(), 10);
  const seconds = Number.parseInt(secondsInput.trim(), 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) {
    return null;
  }
  if (seconds >= 60) {
    return null;
  }
  return minutes * 60 + seconds;
}

export function resolveQuickMixSectionSelection(
  draft: QuickMixSectionDraft
): { selection: QuickMixSectionSelection | null; errors: string[] } {
  if (draft.mode === "first_180") {
    return {
      selection: createDefaultQuickMixSectionSelection(),
      errors: [],
    };
  }

  const startOffsetSeconds = parseQuickMixTimeInput(draft.customMinutes, draft.customSeconds);
  if (startOffsetSeconds === null) {
    return {
      selection: null,
      errors: ["Enter a valid start time using minutes and seconds."],
    };
  }

  return {
    selection: {
      mode: "custom_start",
      startOffsetSeconds,
      windowSeconds: QUICK_MIX_DURATION_CAP_SECONDS,
    },
    errors: [],
  };
}

export function validateQuickMixSectionAgainstDuration(
  selection: QuickMixSectionSelection,
  sourceDurationSeconds: number | null
): string[] {
  const errors: string[] = [];
  const window = selection.windowSeconds;

  if (sourceDurationSeconds === null || !Number.isFinite(sourceDurationSeconds)) {
    if (selection.mode === "custom_start" && selection.startOffsetSeconds > 0) {
      errors.push("Could not read duration. Try First 3:00.");
    }
    return errors;
  }

  const start = selection.startOffsetSeconds;
  if (start < 0) {
    errors.push("Start time cannot be negative.");
  }

  if (start >= sourceDurationSeconds - 0.05) {
    errors.push("Start time is past the end of this file.");
    return errors;
  }

  const available = Math.max(0, sourceDurationSeconds - start);
  if (available <= 0.05) {
    errors.push("This file is shorter than the selected section.");
  }

  if (sourceDurationSeconds < window && start === 0 && sourceDurationSeconds < window - 0.05) {
    // Short full file at first 180 — allowed; window shrinks to file length at prep time.
    return errors;
  }

  if (selection.mode === "custom_start" && available < window - 0.05 && available < sourceDurationSeconds - start) {
    // Partial window near end is OK — prep uses min(window, available).
    return errors;
  }

  return errors;
}

export function effectiveQuickMixWindowSeconds(
  selection: QuickMixSectionSelection,
  sourceDurationSeconds: number | null
): number {
  if (sourceDurationSeconds === null || !Number.isFinite(sourceDurationSeconds)) {
    return selection.windowSeconds;
  }
  const available = Math.max(0, sourceDurationSeconds - selection.startOffsetSeconds);
  return Math.min(selection.windowSeconds, available);
}

export function formatQuickMixSectionRange(
  startOffsetSeconds: number,
  outputDurationSeconds: number | null
): string {
  const startLabel = formatDuration(startOffsetSeconds);
  if (outputDurationSeconds === null || !Number.isFinite(outputDurationSeconds)) {
    return `${startLabel}–?`;
  }
  const end = startOffsetSeconds + outputDurationSeconds;
  return `${startLabel}–${formatDuration(end)}`;
}

export function buildQuickMixSectionOutputLine(summary: QuickMixSectionSummary): string {
  const label = summary.slot === "vocal" ? "Vocal section" : "Instrumental section";
  const range = formatQuickMixSectionRange(
    summary.selection.startOffsetSeconds,
    summary.outputDurationSeconds
  );
  return `${label}: ${range}`;
}

export function buildQuickMixSectionSummaryLines(summaries: QuickMixSectionSummary[]): string[] {
  return [
    ...summaries.map(buildQuickMixSectionOutputLine),
    `Length: ${formatDuration(QUICK_MIX_DURATION_CAP_SECONDS)} MVP cap`,
  ];
}

export function buildQuickMixSectionNotice(summaries: QuickMixSectionSummary[]): string {
  const prefix = `Length: ${QUICK_MIX_DURATION_CAP_SECONDS} seconds (${formatDuration(QUICK_MIX_DURATION_CAP_SECONDS)}) MVP cap — not a full-length song export.`;
  return [prefix, ...summaries.map(buildQuickMixSectionOutputLine)].join(" ");
}
export function shouldPrepareQuickMixSourceForSection(
  selection: QuickMixSectionSelection,
  sourceDurationSeconds: number | null
): boolean {
  if (selection.startOffsetSeconds > 0) {
    return true;
  }
  if (sourceDurationSeconds === null || !Number.isFinite(sourceDurationSeconds)) {
    return true;
  }
  return sourceDurationSeconds > selection.windowSeconds + 0.05;
}

