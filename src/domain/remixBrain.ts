export type ConfidenceTier = "high" | "medium" | "low";

export interface RemixPlanSummary {
  mode: string;
  mode_label: string;
  score: number;
  confidence_tier: ConfidenceTier;
  sync_label: string;
  tempo_label: string;
  key_label: string;
  warnings: string[];
  reason_summary: string;
  score_breakdown: Record<string, number>;
  vocal_anchor_sec: number;
  instrumental_anchor_sec: number;
  vocal_anchor_type: string;
  instrumental_anchor_type: string;
  shift_seconds: number;
}

export interface RemixBrainPlanRequest {
  sourceVocalStemArtifactId: string;
  targetInstrumentalStemArtifactId: string;
  sectionStartSec?: number | null;
  sectionDurationSec?: number | null;
  offsetMs?: number;
  pitchShiftSemitones?: number | null;
  downbeatShift?: number;
  manualOnly?: boolean;
}

export interface RemixBrainPlanResult {
  ok: boolean;
  status: string;
  message: string;
  plan: Record<string, unknown> | null;
  planSummary: RemixPlanSummary | null;
  candidates: Record<string, unknown>[];
  confidenceTier: ConfidenceTier | null;
  alignmentOffsetMs: number | null;
  tempoRatio: number | null;
  pitchShiftSemitones: number | null;
  setupGuidance: string | null;
}

export interface QuickMixRemixBrainCard {
  confidenceTier: ConfidenceTier;
  score: number;
  syncLabel: string;
  tempoLabel: string;
  keyLabel: string;
  warnings: string[];
  anchorOffsetMs: number | null;
  scoreBreakdown: Record<string, number>;
}

export function buildQuickMixRemixBrainCard(
  planSummary: RemixPlanSummary | null,
  anchorOffsetMs: number | null
): QuickMixRemixBrainCard | null {
  if (!planSummary) {
    return null;
  }

  return {
    confidenceTier: planSummary.confidence_tier,
    score: planSummary.score,
    syncLabel: planSummary.sync_label,
    tempoLabel: planSummary.tempo_label,
    keyLabel: planSummary.key_label,
    warnings: planSummary.warnings,
    anchorOffsetMs,
    scoreBreakdown: planSummary.score_breakdown,
  };
}
