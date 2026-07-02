#!/usr/bin/env node
/**
 * Phase 43 Arrangement Brain — real-audio operator API QA (redacted Track A / Track B).
 * Run: npm run smoke:quick-mix:arrangement-brain
 * Env: DJ_REMIX_QA_VOCAL, DJ_REMIX_QA_BEAT (required for real-audio; skips if unset)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-43");
const OUT_REPORT = join(OUT_DIR, "arrangement-brain-operator-qa-report.json");

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

function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".flac") return "audio/flac";
  return "audio/wav";
}

function resolveStemPaths(): { vocal: string; beat: string } | null {
  const envVocal = process.env.DJ_REMIX_QA_VOCAL?.trim() ?? "";
  const envBeat = process.env.DJ_REMIX_QA_BEAT?.trim() ?? "";
  if (envVocal && envBeat && existsSync(envVocal) && existsSync(envBeat)) {
    return { vocal: envVocal, beat: envBeat };
  }
  return null;
}

function listeningNote(input: {
  anchorOffsetMs: number | null;
  confidenceTier: string | null;
  score: number | null;
  phraseAlignment?: string | null;
}): string {
  const anchor = input.anchorOffsetMs ?? 999;
  const tier = input.confidenceTier ?? "low";
  const score = input.score ?? 0;
  if (Math.abs(anchor) <= 35 && (tier === "high" || tier === "medium") && score >= 65) {
    return "in time";
  }
  if (Math.abs(anchor) <= 70 && score >= 55) {
    return "questionable";
  }
  return "not in time";
}

async function healthOk(): Promise<boolean> {
  const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return false;
  const payload = (await response.json()) as { ok?: boolean };
  return Boolean(payload.ok);
}

async function uploadStem(filePath: string): Promise<string> {
  const bytes = readFileSync(filePath);
  const mime = mimeForPath(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `track${extname(filePath) || ".wav"}`);
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
      export_label: "arrangement-brain-operator-qa",
      loudness_target_mode: "measurement_only",
      neutral_processing: false,
      confirm_neutral_settings: true,
      ...QUICK_MIX_MIX,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function exportMp3(wavArtifactId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/mp3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_wav_export_artifact_id: wavArtifactId,
      bitrate_kbps: 192,
      export_label: "arrangement-brain-operator-qa-mp3",
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

function sectionDetails(plan: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const arrangement = plan?.arrangement_plan as Record<string, unknown> | undefined;
  const sections = arrangement?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    const row = section as Record<string, unknown>;
    return {
      label: row.label ?? null,
      source: row.source ?? null,
      start_seconds: row.start_seconds ?? null,
      duration_seconds: row.duration_seconds ?? null,
      bar_length: row.bar_length ?? null,
      start_bar: row.start_bar ?? null,
    };
  });
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

  console.log("Arrangement Brain operator QA — Track A × Track B (redacted)");
  const uploadStarted = Date.now();
  const vocalStemId = await uploadStem(stems.vocal);
  const beatStemId = await uploadStem(stems.beat);
  const uploadSeconds = Math.round((Date.now() - uploadStarted) / 1000);

  const results: Record<string, unknown>[] = [];
  let allPassed = true;

  for (const mode of STYLES) {
    const started = Date.now();
    const planPayload = await planArrangement(vocalStemId, beatStemId, mode);
    if (!planPayload.ok) {
      throw new Error(`Plan failed (${mode}): ${String(planPayload.message ?? "unknown")}`);
    }

    const wav = await exportArrangementWav(vocalStemId, beatStemId, planPayload);
    if (!wav.ok) {
      throw new Error(`WAV export failed (${mode}): ${String(wav.message ?? "unknown")}`);
    }

    const wavId = typeof wav.export_artifact_id === "string" ? wav.export_artifact_id : null;
    let mp3ArtifactId: string | null = null;
    let mp3SkipReason: string | null = null;
    if (wavId) {
      try {
        const mp3 = await exportMp3(wavId);
        if (mp3.ok && typeof mp3.export_artifact_id === "string") {
          mp3ArtifactId = mp3.export_artifact_id;
        } else {
          mp3SkipReason = String(mp3.message ?? "MP3 export failed (non-blocking)");
        }
      } catch (error) {
        mp3SkipReason = error instanceof Error ? error.message : String(error);
      }
    }

    const sections = sectionDetails(planPayload);
    const labels = sections.map((s) => String(s.label ?? ""));
    const summary = planPayload.arrangement_summary as Record<string, unknown> | undefined;
    const remixSummary = planPayload.remix_plan_summary as Record<string, unknown> | undefined;
    const arrangementPlan = planPayload.arrangement_plan as Record<string, unknown> | undefined;
    const anchorOffsetMs =
      typeof planPayload.alignment_offset_ms === "number" ? planPayload.alignment_offset_ms : null;
    const score = typeof summary?.score === "number" ? summary.score : null;
    const confidenceTier =
      typeof summary?.confidence_tier === "string" ? summary.confidence_tier : null;
    const warnings = Array.isArray(summary?.warnings)
      ? summary.warnings.map((w) => String(w))
      : [];

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
      structure: summary?.summary_line ?? null,
      section_starts: sections.map((s) => ({
        label: s.label,
        start_seconds: s.start_seconds,
        bar_length: s.bar_length,
      })),
      sections,
      bpm_estimate: arrangementPlan?.target_bpm ?? remixSummary?.target_bpm ?? null,
      key_compatibility: summary?.key_label ?? remixSummary?.harmonic_compatibility ?? null,
      camelot: remixSummary?.camelot ?? null,
      plan_score: score,
      confidence_tier: confidenceTier,
      anchor_offset_ms: anchorOffsetMs,
      phrase_alignment: remixSummary?.phrase_alignment ?? null,
      wav_export_artifact_id: wavId,
      mp3_artifact_id: mp3ArtifactId,
      mp3_skip_reason: mp3SkipReason,
      runtime_seconds: Math.round((Date.now() - started) / 1000),
      warnings,
      listening_note: listeningNote({
        anchorOffsetMs,
        confidenceTier,
        score,
        phraseAlignment:
          typeof remixSummary?.phrase_alignment === "string"
            ? remixSummary.phrase_alignment
            : null,
      }),
      passed: modePassed && Boolean(wavId),
    });
  }

  const report = {
    label: "Track A × Track B",
    using_real_audio: true,
    stem_upload_seconds: uploadSeconds,
    styles: results,
    passed: allPassed,
    finished_at: new Date().toISOString(),
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!allPassed) {
    console.error("Arrangement Brain operator QA failed structure gate.");
    process.exit(1);
  }
  console.log("Arrangement Brain operator QA PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
