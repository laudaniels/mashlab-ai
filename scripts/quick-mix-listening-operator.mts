#!/usr/bin/env node
/**
 * Operator listening A/B — RC2 baseline vs Phase 39 profile on local files.
 * Filenames are NEVER written to the log (redacted as Track A / Track B).
 *
 * Run:
 *   MASHLAB_QM_VOCAL="..." MASHLAB_QM_BEAT="..." npm run listening:quick-mix
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-39");
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

  const log = {
    phase: "phase-39-listening-operator",
    startedAt,
    finishedAt: new Date().toISOString(),
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    rc2Baseline: {
      mixSettings: RC2_MIX,
      export: rc2Wav.ok
        ? {
            artifactId: rc2Wav.export_artifact_id,
            loudness: rc2Wav.loudness ?? null,
            loudnessGate: rc2Wav.loudness_gate ?? null,
            duckApplied: (rc2Wav.processing_summary as Record<string, unknown> | undefined)
              ?.instrumental_duck_applied ?? false,
            warnings: rc2Wav.warnings ?? [],
          }
        : { error: rc2Wav.message },
    },
    phase39Profile: {
      mixSettings: PHASE39_MIX,
      export: p39Wav.ok
        ? {
            artifactId: p39Wav.export_artifact_id,
            loudness: p39Wav.loudness ?? null,
            loudnessGate: p39Wav.loudness_gate ?? null,
            duckApplied: (p39Wav.processing_summary as Record<string, unknown> | undefined)
              ?.instrumental_duck_applied ?? true,
            warnings: p39Wav.warnings ?? [],
          }
        : { error: p39Wav.message },
    },
    listeningNotes: [
      "Compare RC2 vs Phase 39 locally — filenames redacted in this log.",
      "Phase 39 should feel vocal-forward with bed tucked; duck should be subtle.",
      "Neither export is a mastered release — DJ review required.",
    ],
    ok: rc2Wav.ok === true && p39Wav.ok === true,
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
