#!/usr/bin/env node
/**
 * Arrangement Brain QA — plan + arrangement WAV export for all three styles.
 * Uses env-selected local stems only (redacted Track A / Track B labels).
 *
 * Run: npm run smoke:quick-mix:arrangement-brain
 * Env: DJ_REMIX_QA_VOCAL, DJ_REMIX_QA_BEAT (optional local stem paths)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-43");
const OUT_REPORT = join(OUT_DIR, "arrangement-brain-qa-report.json");

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

const STYLES = ["clean_blend", "hook_remix", "dj_edit"] as const;

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

async function planArrangement(
  vocalStemId: string,
  beatStemId: string,
  mode: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/plan/arrangement-brain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_vocal_stem_artifact_id: vocalStemId,
      target_instrumental_stem_artifact_id: beatStemId,
      arrangement_mode: mode,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function exportArrangementWav(
  vocalStemId: string,
  beatStemId: string,
  planPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/arrangement-wav`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_vocal_stem_artifact_id: vocalStemId,
      target_instrumental_stem_artifact_id: beatStemId,
      arrangement_plan: planPayload.arrangement_plan,
      tempo_ratio: planPayload.tempo_ratio ?? null,
      pitch_shift_semitones: planPayload.pitch_shift_semitones ?? 0,
      alignment_offset_ms: planPayload.alignment_offset_ms ?? 0,
      export_label: `arrangement-brain-qa-${String(planPayload.arrangement_mode ?? "mix")}`,
      loudness_target_mode: "measurement_only",
      neutral_processing: false,
      confirm_neutral_settings: true,
      ...QUICK_MIX_MIX,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

function sectionLabels(plan: Record<string, unknown> | undefined): string[] {
  const arrangement = plan?.arrangement_plan as Record<string, unknown> | undefined;
  const sections = arrangement?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.map((s) => String((s as Record<string, unknown>).label ?? ""));
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

  console.log("Arrangement Brain QA — Track A × Track B (redacted)");
  const vocalStemId = await uploadStem(stems.vocal);
  const beatStemId = await uploadStem(stems.beat);

  const results: Record<string, unknown>[] = [];
  let allPassed = true;

  for (const mode of STYLES) {
    const planPayload = await planArrangement(vocalStemId, beatStemId, mode);
    if (!planPayload.ok) {
      throw new Error(`Plan failed (${mode}): ${String(planPayload.message ?? "unknown")}`);
    }

    const wav = await exportArrangementWav(vocalStemId, beatStemId, planPayload);
    if (!wav.ok) {
      throw new Error(`WAV export failed (${mode}): ${String(wav.message ?? "unknown")}`);
    }

    const labels = sectionLabels(planPayload);
    const summary = planPayload.arrangement_summary as Record<string, unknown> | undefined;
    const modePassed =
      mode === "clean_blend"
        ? labels.length >= 1
        : mode === "hook_remix"
          ? labels.includes("hook")
          : labels[0] === "intro" && labels.includes("break") && labels.at(-1) === "outro";

    if (!modePassed) allPassed = false;

    results.push({
      mode,
      label: "Track A × Track B",
      section_labels: labels,
      summary_line: summary?.summary_line ?? null,
      confidence_tier: planPayload.confidence_tier ?? summary?.confidence_tier ?? null,
      score: summary?.score ?? null,
      wav_export_artifact_id: wav.export_artifact_id ?? null,
      passed: modePassed && Boolean(wav.export_artifact_id),
    });
  }

  const report = { styles: results, passed: allPassed };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!allPassed) {
    console.error("Arrangement Brain QA failed structure gate.");
    process.exit(1);
  }
  console.log("Arrangement Brain QA PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
