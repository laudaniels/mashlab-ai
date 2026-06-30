#!/usr/bin/env node
/**
 * Quick Mix smoke test — orchestrated pipeline via sidecar API.
 * Uses synthetic non-copyright test audio (generated if missing).
 *
 * Run: npm run smoke:quick-mix
 * Requires: healthy sidecar on 127.0.0.1:47831, Demucs, FFmpeg, Rubber Band
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:47831";
const AUDIO_DIR = join(ROOT, "qa/full-local-workflow/phase-32/test-audio");
const TRACK_A = join(AUDIO_DIR, "track-a-vocal-like-15s.wav");
const TRACK_B = join(AUDIO_DIR, "track-b-instrumental-15s.wav");
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-37");
const OUT_LOG = join(OUT_DIR, "quick-mix-smoke-log.json");

function ensureSyntheticAudio(): void {
  mkdirSync(AUDIO_DIR, { recursive: true });
  if (!existsSync(TRACK_A)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=15",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=15",
        "-filter_complex",
        "[0]volume=0.75[a];[1]volume=0.2[b];[a][b]amix=inputs=2:duration=first",
        "-ac",
        "2",
        "-ar",
        "44100",
        TRACK_A,
      ],
      { stdio: "ignore" }
    );
  }
  if (!existsSync(TRACK_B)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=110:duration=15",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=d=15:c=pink:a=0.015",
        "-filter_complex",
        "[0]volume=0.6[a];[1]volume=0.4[b];[a][b]amix=inputs=2:duration=first",
        "-ac",
        "2",
        "-ar",
        "44100",
        TRACK_B,
      ],
      { stdio: "ignore" }
    );
  }
}

async function postStem(filePath: string, maxSeconds = 15): Promise<Record<string, unknown>> {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), filePath.split(/[/\\]/).pop() ?? "track.wav");
  form.append("split_mode", "vocals_no_vocals");
  form.append("max_preview_seconds", String(maxSeconds));

  const response = await fetch(`${BASE}/v1/process/stem-preview`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(1_800_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function postFullWav(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/full-wav`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function postMp3(sourceWavExportArtifactId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/v1/export/mp3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_wav_export_artifact_id: sourceWavExportArtifactId,
      bitrate_kbps: 192,
      export_label: "quick-mix-smoke-mp3",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  ensureSyntheticAudio();

  const healthResponse = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
  if (!healthResponse.ok) {
    console.error("Sidecar health check failed. Start with: npm run sidecar:start");
    process.exit(1);
  }
  const health = (await healthResponse.json()) as Record<string, unknown>;
  if (health.service !== "mashlab-local-engine") {
    console.error("Sidecar health response is not MashLab:", health);
    process.exit(1);
  }

  console.log("Quick Mix smoke — stem vocal source…");
  const vocalStem = await postStem(TRACK_A);
  if (!vocalStem.ok) {
    console.error("Vocal stem failed:", vocalStem.message, vocalStem.validation_errors);
    process.exit(1);
  }

  console.log("Quick Mix smoke — stem instrumental source…");
  const beatStem = await postStem(TRACK_B);
  if (!beatStem.ok) {
    console.error("Instrumental stem failed:", beatStem.message, beatStem.validation_errors);
    process.exit(1);
  }

  const vocalId = vocalStem.artifact_id as string;
  const beatId = beatStem.artifact_id as string;

  console.log("Quick Mix smoke — full WAV export…");
  const wav = await postFullWav({
    source_vocal_stem_artifact_id: vocalId,
    target_instrumental_stem_artifact_id: beatId,
    mash_intent: "vocal_a_over_beat_b",
    tempo_ratio: null,
    source_bpm: null,
    target_bpm: null,
    pitch_shift_semitones: 0,
    alignment_offset_ms: 0,
    export_label: "quick-mix-smoke",
    loudness_target_mode: "measurement_only",
    neutral_processing: true,
    confirm_neutral_settings: true,
    vocal_gain_db: 0,
    instrumental_gain_db: 0,
    master_gain_db: 0,
    vocal_fade_in_ms: 0,
    vocal_fade_out_ms: 0,
    instrumental_fade_in_ms: 0,
    instrumental_fade_out_ms: 0,
    limiter_safety: true,
    clipping_guard: true,
  });

  if (!wav.ok || !wav.export_artifact_id) {
    console.error("WAV export failed:", wav.message, wav.validation_errors);
    process.exit(1);
  }

  console.log("Quick Mix smoke — optional MP3 reference…");
  const mp3 = await postMp3(wav.export_artifact_id as string);

  mkdirSync(OUT_DIR, { recursive: true });
  const log = {
    health,
    vocalStem,
    beatStem,
    wav,
    mp3,
    mp3Ok: mp3.ok === true,
    wavArtifactId: wav.export_artifact_id,
    mp3ArtifactId: mp3.export_artifact_id ?? null,
    at: new Date().toISOString(),
  };
  await import("node:fs/promises").then((fs) => fs.writeFile(OUT_LOG, `${JSON.stringify(log, null, 2)}\n`, "utf8"));

  console.log("PASS — Quick Mix smoke produced local WAV export:", wav.export_artifact_id);
  if (mp3.ok) {
    console.log("PASS — optional MP3 reference:", mp3.export_artifact_id);
  } else {
    console.log("NOTE — MP3 reference skipped/failed (WAV still valid):", mp3.message ?? mp3.status);
  }
  console.log("Log:", OUT_LOG);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
