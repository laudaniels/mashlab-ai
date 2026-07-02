#!/usr/bin/env node
/**
 * Remix Brain QA — plan + full WAV export via RC4 local-engine sidecar.
 * Uses env-selected local stems only (redacted Track A / Track B labels).
 *
 * Run: npm run smoke:quick-mix:remix-brain
 * Env: DJ_REMIX_QA_VOCAL, DJ_REMIX_QA_BEAT (optional local stem paths)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-42");
const OUT_REPORT = join(OUT_DIR, "remix-brain-qa-report.json");

const QUICK_MIX_MIX = {
  vocal_gain_db: 1.5,
  instrumental_gain_db: -3,
  master_gain_db: -1,
  vocal_fade_in_ms: 0,
  vocal_fade_out_ms: 0,
  instrumental_fade_in_ms: 0,
  instrumental_fade_out_ms: 0,
  limiter_safety: true,
  clipping_guard: true,
  instrumental_duck_under_vocal: true,
} as const;

function resolveStemPaths(): { vocal: string; beat: string } | null {
  const envVocal = process.env.DJ_REMIX_QA_VOCAL?.trim() ?? "";
  const envBeat = process.env.DJ_REMIX_QA_BEAT?.trim() ?? "";
  if (envVocal && envBeat && existsSync(envVocal) && existsSync(envBeat)) {
    return { vocal: envVocal, beat: envBeat };
  }
  return null;
}

async function healthOk(): Promise<boolean> {
  const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return false;
  const payload = (await response.json()) as { ok?: boolean };
  return Boolean(payload.ok);
}

async function uploadStem(filePath: string): Promise<string> {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "track.wav");
  form.append("split_mode", "vocals_no_vocals");
  form.append("max_preview_seconds", "180");
  const response = await fetch(`${BASE}/v1/process/stem-preview`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(1_800_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!payload.ok || typeof payload.artifact_id !== "string") {
    throw new Error(`Stem preview failed: ${String(payload.message ?? "unknown")}`);
  }
  return payload.artifact_id;
}

async function planRemixBrain(vocalStemId: string, beatStemId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/plan/remix-brain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_vocal_stem_artifact_id: vocalStemId,
      target_instrumental_stem_artifact_id: beatStemId,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function exportWav(
  vocalStemId: string,
  beatStemId: string,
  plan: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/full-wav`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_vocal_stem_artifact_id: vocalStemId,
      target_instrumental_stem_artifact_id: beatStemId,
      mash_intent: "vocal_a_over_beat_b",
      tempo_ratio: plan.tempo_ratio ?? null,
      pitch_shift_semitones: plan.pitch_shift_semitones ?? 0,
      alignment_offset_ms: plan.alignment_offset_ms ?? 0,
      export_label: "remix-brain-qa",
      loudness_target_mode: "measurement_only",
      neutral_processing: false,
      confirm_neutral_settings: true,
      ...QUICK_MIX_MIX,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const stems = resolveStemPaths();
  if (!stems) {
    console.log("QA skipped: set DJ_REMIX_QA_VOCAL + DJ_REMIX_QA_BEAT to local stem paths.");
    process.exit(0);
  }

  if (!(await healthOk())) {
    console.error("Sidecar health check failed — start with npm run sidecar:start");
    process.exit(1);
  }

  console.log("Remix Brain QA — Track A × Track B (redacted)");
  const vocalStemId = await uploadStem(stems.vocal);
  const beatStemId = await uploadStem(stems.beat);
  const planPayload = await planRemixBrain(vocalStemId, beatStemId);
  if (!planPayload.ok) {
    throw new Error(`Plan failed: ${String(planPayload.message ?? "unknown")}`);
  }

  const wav = await exportWav(vocalStemId, beatStemId, planPayload);
  if (!wav.ok) {
    throw new Error(`WAV export failed: ${String(wav.message ?? "unknown")}`);
  }

  const processing = wav.processing_summary as Record<string, unknown> | undefined;
  const anchorOffsetMs =
    typeof processing?.alignment_offset_ms === "number" ? processing.alignment_offset_ms : null;
  const planSummary = planPayload.plan_summary as Record<string, unknown> | undefined;

  const report = {
    label: "Track A × Track B",
    plan_score: planSummary?.score ?? null,
    confidence_tier: planPayload.confidence_tier ?? null,
    anchor_offset_ms: anchorOffsetMs,
    alignment_offset_ms: planPayload.alignment_offset_ms ?? null,
    wav_export_artifact_id: wav.export_artifact_id ?? null,
    passed: anchorOffsetMs !== null && Math.abs(anchorOffsetMs) < 70,
  };

  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("Remix Brain QA failed anchor offset gate (<70 ms).");
    process.exit(1);
  }
  console.log("Remix Brain QA PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
