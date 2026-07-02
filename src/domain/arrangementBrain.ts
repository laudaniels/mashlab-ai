export type ArrangementStyle = "clean_blend" | "hook_remix" | "dj_edit";

export type ConfidenceTier = "high" | "medium" | "low";

export const ARRANGEMENT_STYLE_OPTIONS: Array<{
  id: ArrangementStyle;
  label: string;
  description: string;
}> = [
  {
    id: "clean_blend",
    label: "Clean Blend",
    description: "Phrase-aligned vocal over beat — same as RC6 Remix Brain default.",
  },
  {
    id: "hook_remix",
    label: "Hook Remix",
    description: "Focus on the strongest vocal hook phrase with a compatible instrumental bed.",
  },
  {
    id: "dj_edit",
    label: "DJ Edit",
    description: "Intro → hook → break → hook → outro on bar boundaries.",
  },
];

export const DEFAULT_ARRANGEMENT_STYLE: ArrangementStyle = "clean_blend";

export interface ArrangementSectionSummary {
  label: string;
  source: string;
  start_seconds: number;
  duration_seconds: number;
  bar_length: number;
}

export interface ArrangementSummary {
  mode: ArrangementStyle;
  mode_label: string;
  summary_line: string;
  score: number;
  confidence_tier: ConfidenceTier;
  warnings: string[];
  score_breakdown: Record<string, number>;
  total_duration_seconds: number;
  tempo_label: string;
  key_label: string;
  sync_label: string;
}

export interface ArrangementBrainPlanResult {
  ok: boolean;
  status: string;
  message: string;
  arrangementPlan: Record<string, unknown> | null;
  arrangementSummary: ArrangementSummary | null;
  remixPlanSummary: Record<string, unknown> | null;
  alignmentOffsetMs: number | null;
  tempoRatio: number | null;
  pitchShiftSemitones: number | null;
  setupGuidance: string | null;
}

export interface QuickMixArrangementCard {
  styleLabel: string;
  summaryLine: string;
  confidenceTier: ConfidenceTier;
  score: number;
  tempoLabel: string;
  keyLabel: string;
  syncLabel: string;
  warnings: string[];
  sections: ArrangementSectionSummary[];
}

export function buildQuickMixArrangementCard(
  summary: ArrangementSummary | null,
  arrangementPlan: Record<string, unknown> | null
): QuickMixArrangementCard | null {
  if (!summary) {
    return null;
  }
  const rawSections = Array.isArray(arrangementPlan?.sections)
    ? (arrangementPlan.sections as Record<string, unknown>[])
    : [];
  const sections: ArrangementSectionSummary[] = rawSections.map((section) => ({
    label: String(section.label ?? "mix"),
    source: String(section.source ?? "mix"),
    start_seconds: Number(section.start_seconds ?? 0),
    duration_seconds: Number(section.duration_seconds ?? 0),
    bar_length: Number(section.bar_length ?? 0),
  }));

  return {
    styleLabel: summary.mode_label,
    summaryLine: summary.summary_line,
    confidenceTier: summary.confidence_tier,
    score: summary.score,
    tempoLabel: summary.tempo_label,
    keyLabel: summary.key_label,
    syncLabel: summary.sync_label,
    warnings: summary.warnings,
    sections,
  };
}

export function arrangementStyleLabel(style: ArrangementStyle): string {
  return ARRANGEMENT_STYLE_OPTIONS.find((option) => option.id === style)?.label ?? "Clean Blend";
}
