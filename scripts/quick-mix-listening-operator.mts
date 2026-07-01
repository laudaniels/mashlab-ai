#!/usr/bin/env node
/**
 * Operator listening A/B — RC2 vs Phase 39 vs Phase 40 on local files.
 * Filenames are NEVER written to the log (redacted as Track A / Track B).
 *
 * Run:
 *   MASHLAB_QM_VOCAL="..." MASHLAB_QM_BEAT="..." node --experimental-strip-types scripts/quick-mix-listening-operator.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-40");
const OUT_LOG = join(OUT_DIR, "quick-mix-listening-operator-log.json");

const TRACK_A = process.env.MASHLAB_QM_VOCAL?.trim();
const TRACK_B = process.env.MASHLAB_QM_BEAT?.trim();

const RC2_MIX = {
  vocal_gain_db: 0,
  instrumental_gain_db: 0,
  master_gain_db: 0,
  vocal_fade_in_ms: 0,
  vocal_fade_out_ms: 0,
  instrumental_fade_in_ms: 0,
  instrumental_fade_out_ms: 0,
  limiter_safety: true,
  clipping_guard: true,
  instrumental_duck_under_vocal: false,
} as const;

const PHASE39_MIX = {
  vocal_gain_db: 1.5,
  instrumental_gain_db: -3,
  master_gain_db: -0.5,
  vocal_fade_in_ms: 0,
  vocal_fade_out_ms: 0,
  instrumental_fade_in_ms: 0,
  instrumental_fade_out_ms: 0,
  limiter_safety: true,
  clipping_guard: true,
  instrumental_duck_under_vocal: true,
} as const;

const PHASE40_MIX = {
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

async function postStem(filePath: string): Promise<Record<string, unknown>> {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "track-redacted.mp3");
  form.append("split_mode", "vocals_no_vocals");
  form.append("max_preview_seconds", "180");

  const response = await fetch(`${BASE}/v1/process/stem-preview`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(1_800_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function postFullWav(
  vocalId: string,
  beatId: string,
  mix: Record<string, unknown>,
  label: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/full-wav`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_vocal_stem_artifact_id: vocalId,
      target_instrumental_stem_artifact_id: beatId,
      mash_intent: "vocal_a_over_beat_b",
      tempo_ratio: null,
      source_bpm: null,
      target_bpm: null,
      pitch_shift_semitones: 0,
      alignment_offset_ms: 0,
      export_label: label,
      loudness_target_mode: "measurement_only",
      neutral_processing: true,
      confirm_neutral_settings: true,
      ...mix,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

function summarizeExport(wav: Record<string, unknown>): Record<string, unknown> {
  if (!wav.ok) {
    return { error: wav.message };
  }
  return {
    artifactId: wav.export_artifact_id,
    loudness: wav.loudness ?? null,
    loudnessGate: wav.loudness_gate ?? null,
    duckApplied:
      (wav.processing_summary as Record<string, unknown> | undefined)?.instrumental_duck_applied ??
      false,
    warnings: wav.warnings ?? [],
  };
}

async function main(): Promise<void> {
  if (!TRACK_A || !TRACK_B) {
    console.error("Set MASHLAB_QM_VOCAL and MASHLAB_QM_BEAT to local file paths.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) {
    console.error("Sidecar not healthy.");
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log("Listening operator — stem Track A (vocal)…");
  const vocalStem = await postStem(TRACK_A);
  if (!vocalStem.ok) {
    console.error("Vocal stem failed:", vocalStem.message);
    process.exit(1);
  }

  console.log("Listening operator — stem Track B (instrumental)…");
  const beatStem = await postStem(TRACK_B);
  if (!beatStem.ok) {
    console.error("Beat stem failed:", beatStem.message);
    process.exit(1);
  }

  const vocalId = vocalStem.artifact_id as string;
  const beatId = beatStem.artifact_id as string;

  console.log("Listening operator — RC2 baseline export…");
  const rc2Wav = await postFullWav(vocalId, beatId, RC2_MIX, "listening-rc2-baseline");

  console.log("Listening operator — Phase 39 profile export…");
  const p39Wav = await postFullWav(vocalId, beatId, PHASE39_MIX, "listening-phase39-profile");

  console.log("Listening operator — Phase 40 safety profile export…");
  const p40Wav = await postFullWav(vocalId, beatId, PHASE40_MIX, "listening-phase40-safety");

  const log = {
    phase: "phase-40-true-peak-safety",
    startedAt,
    finishedAt: new Date().toISOString(),
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    rc2Baseline: { mixSettings: RC2_MIX, export: summarizeExport(rc2Wav) },
    phase39Profile: { mixSettings: PHASE39_MIX, export: summarizeExport(p39Wav) },
    phase40Safety: { mixSettings: PHASE40_MIX, export: summarizeExport(p40Wav) },
    listeningNotes: [
      "Compare RC2 vs Phase 39 vs Phase 40 locally — filenames redacted in this log.",
      "Phase 40 keeps vocal-forward feel with staged limiter + safer master trim.",
      "Neither export is a mastered release — DJ review required.",
    ],
    ok: rc2Wav.ok === true && p39Wav.ok === true && p40Wav.ok === true,
  };

  writeFileSync(OUT_LOG, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(log, null, 2));
  console.log("Log:", OUT_LOG);

  if (!log.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
