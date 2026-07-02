import type { RemixBrainPlanResult, RemixPlanSummary } from "../../domain/remixBrain.ts";

function parsePlanSummary(raw: unknown): RemixPlanSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.score !== "number" || typeof value.confidence_tier !== "string") {
    return null;
  }
  return {
    mode: String(value.mode ?? "clean_blend"),
    mode_label: String(value.mode_label ?? "Clean Blend"),
    score: value.score,
    confidence_tier: value.confidence_tier as RemixPlanSummary["confidence_tier"],
    sync_label: String(value.sync_label ?? ""),
    tempo_label: String(value.tempo_label ?? ""),
    key_label: String(value.key_label ?? ""),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    reason_summary: String(value.reason_summary ?? ""),
    score_breakdown:
      value.score_breakdown && typeof value.score_breakdown === "object"
        ? (value.score_breakdown as Record<string, number>)
        : {},
    vocal_anchor_sec: Number(value.vocal_anchor_sec ?? 0),
    instrumental_anchor_sec: Number(value.instrumental_anchor_sec ?? 0),
    vocal_anchor_type: String(value.vocal_anchor_type ?? "downbeat"),
    instrumental_anchor_type: String(value.instrumental_anchor_type ?? "downbeat"),
    shift_seconds: Number(value.shift_seconds ?? 0),
  };
}

export function parseRemixBrainPlanResponse(payload: unknown): RemixBrainPlanResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = payload as Record<string, unknown>;
  return {
    ok: Boolean(value.ok),
    status: String(value.status ?? "unknown"),
    message: String(value.message ?? ""),
    plan:
      value.plan && typeof value.plan === "object" ? (value.plan as Record<string, unknown>) : null,
    planSummary: parsePlanSummary(value.plan_summary),
    candidates: Array.isArray(value.candidates)
      ? value.candidates.filter((item): item is Record<string, unknown> => typeof item === "object")
      : [],
    confidenceTier:
      typeof value.confidence_tier === "string"
        ? (value.confidence_tier as RemixBrainPlanResult["confidenceTier"])
        : null,
    alignmentOffsetMs:
      typeof value.alignment_offset_ms === "number" ? value.alignment_offset_ms : null,
    tempoRatio: typeof value.tempo_ratio === "number" ? value.tempo_ratio : null,
    pitchShiftSemitones:
      typeof value.pitch_shift_semitones === "number" ? value.pitch_shift_semitones : null,
    setupGuidance: typeof value.setup_guidance === "string" ? value.setup_guidance : null,
  };
}
