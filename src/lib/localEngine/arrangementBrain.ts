import type {
  ArrangementBrainPlanResult,
  ArrangementStyle,
  ArrangementSummary,
  ConfidenceTier,
} from "../../domain/arrangementBrain.ts";

function parseArrangementSummary(raw: unknown): ArrangementSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.score !== "number" || typeof value.confidence_tier !== "string") {
    return null;
  }
  return {
    mode: (value.mode as ArrangementStyle) ?? "clean_blend",
    mode_label: String(value.mode_label ?? "Clean Blend"),
    summary_line: String(value.summary_line ?? ""),
    score: value.score,
    confidence_tier: value.confidence_tier as ConfidenceTier,
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    score_breakdown:
      value.score_breakdown && typeof value.score_breakdown === "object"
        ? (value.score_breakdown as Record<string, number>)
        : {},
    total_duration_seconds: Number(value.total_duration_seconds ?? 0),
    tempo_label: String(value.tempo_label ?? ""),
    key_label: String(value.key_label ?? ""),
    sync_label: String(value.sync_label ?? ""),
  };
}

export function parseArrangementBrainPlanResponse(payload: unknown): ArrangementBrainPlanResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = payload as Record<string, unknown>;
  return {
    ok: Boolean(value.ok),
    status: String(value.status ?? "unknown"),
    message: String(value.message ?? ""),
    arrangementPlan:
      value.arrangement_plan && typeof value.arrangement_plan === "object"
        ? (value.arrangement_plan as Record<string, unknown>)
        : null,
    arrangementSummary: parseArrangementSummary(value.arrangement_summary),
    remixPlanSummary:
      value.remix_plan_summary && typeof value.remix_plan_summary === "object"
        ? (value.remix_plan_summary as Record<string, unknown>)
        : null,
    alignmentOffsetMs:
      typeof value.alignment_offset_ms === "number" ? value.alignment_offset_ms : null,
    tempoRatio: typeof value.tempo_ratio === "number" ? value.tempo_ratio : null,
    pitchShiftSemitones:
      typeof value.pitch_shift_semitones === "number" ? value.pitch_shift_semitones : null,
    setupGuidance: typeof value.setup_guidance === "string" ? value.setup_guidance : null,
  };
}
