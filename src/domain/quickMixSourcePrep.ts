import { formatDuration } from "../lib/audioMetadata.ts";
import {
  QUICK_MIX_DURATION_CAP_SECONDS,
  type QuickMixUploadSlot,
} from "./quickMix.ts";

export interface QuickMixPreparedSource {
  file: File;
  sourceDurationSeconds: number | null;
  outputDurationSeconds: number | null;
  startOffsetSeconds: number;
  trimmed: boolean;
  fadeOutApplied: boolean;
}

export interface QuickMixTrimSummary {
  slot: QuickMixUploadSlot;
  sourceDurationSeconds: number | null;
  outputDurationSeconds: number | null;
  trimmed: boolean;
  fadeOutApplied: boolean;
}

export function shouldPrepareQuickMixSource(durationSeconds: number | null): boolean {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return true;
  }
  return durationSeconds > QUICK_MIX_DURATION_CAP_SECONDS + 0.05;
}

export function buildQuickMixTrimLine(summary: QuickMixTrimSummary): string {
  const label = summary.slot === "vocal" ? "Vocal source" : "Instrumental source";
  const output = formatDuration(summary.outputDurationSeconds);
  if (!summary.trimmed) {
    return `${label}: using full clip (${output}) — within Quick Mix MVP length.`;
  }
  const source = formatDuration(summary.sourceDurationSeconds);
  const fade = summary.fadeOutApplied ? " with a 1 s fade-out" : "";
  return `${label}: shortened from ${source} to ${output}${fade} for Quick Mix MVP.`;
}

export function buildQuickMixTrimNotice(summaries: QuickMixTrimSummary[]): string | null {
  const lines = summaries.map(buildQuickMixTrimLine);
  if (lines.length === 0) {
    return null;
  }
  const anyTrimmed = summaries.some((summary) => summary.trimmed);
  if (!anyTrimmed) {
    return null;
  }
  return [
    `Quick Mix prepared ${summaries.filter((summary) => summary.trimmed).length} source(s) at up to ${QUICK_MIX_DURATION_CAP_SECONDS} seconds (3:00) — not a full-length song export.`,
    ...lines.filter((_, index) => summaries[index]?.trimmed),
  ].join(" ");
}

export function buildQuickMixTrimNoticeLines(summaries: QuickMixTrimSummary[]): string[] {
  const notice = buildQuickMixTrimNotice(summaries);
  if (!notice) {
    return [];
  }
  return notice.split(". ").map((part) => (part.endsWith(".") ? part : `${part}.`)).filter(Boolean);
}
