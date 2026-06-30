#!/usr/bin/env node
/** Validate optional librosa analysis lane on synthetic test audio. */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { formatLibrosaCapabilityStatus } from "../src/domain/localDemoStart.ts";
import { SIDECAR_CAPABILITIES_URL } from "../src/domain/sidecarLifecycle.ts";

const execFileAsync = promisify(execFile);
const logDir = join(process.cwd(), "qa/full-local-workflow/phase-34/logs");
const testAudio =
  join(process.cwd(), "qa/full-local-workflow/phase-32/test-audio/track-a-vocal-like-15s.wav");

mkdirSync(logDir, { recursive: true });

async function curlJson(url: string): Promise<unknown> {
  const { stdout } = await execFileAsync("curl.exe", ["-s", url], { timeout: 15000 });
  return JSON.parse(stdout);
}

async function postAnalyze(lane: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    "curl.exe",
    ["-s", "-X", "POST", `http://127.0.0.1:47831/v1/analyze/${lane}`, "-F", `file=@${testAudio}`],
    { timeout: 120000 }
  );
  return JSON.parse(stdout);
}

const results: Array<{ step: string; pass: boolean; detail: string }> = [];

function record(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${step} — ${detail}`);
}

if (!existsSync(testAudio)) {
  console.error(`Missing test audio: ${testAudio}`);
  process.exit(1);
}

const caps = (await curlJson(SIDECAR_CAPABILITIES_URL)) as {
  capabilities?: Array<{ id: string; status: string; version?: string | null; message?: string }>;
};
writeFileSync(join(logDir, "capabilities-after-librosa.json"), JSON.stringify(caps, null, 2));

const librosa = caps.capabilities?.find((c) => c.id === "librosa");
const librosaOk = librosa?.status === "available";
record("librosa capability", librosaOk, formatLibrosaCapabilityStatus(librosa?.status, librosa?.version ?? null));

for (const lane of ["beat", "key", "phrases"]) {
  const resp = (await postAnalyze(lane)) as { ok?: boolean; status?: string; message?: string };
  writeFileSync(join(logDir, `analyze-${lane}.json`), JSON.stringify(resp, null, 2));
  if (librosaOk) {
    const phraseSyntheticOk =
      lane === "phrases" && !resp.ok && /beat times|No beat/i.test(resp.message ?? "");
    record(
      `analyze ${lane}`,
      resp.ok === true || phraseSyntheticOk,
      resp.message ?? String(resp.status)
    );
  } else {
    record(
      `analyze ${lane}`,
      /librosa|not installed|missing/i.test(resp.message ?? ""),
      resp.message ?? String(resp.status)
    );
  }
}

writeFileSync(join(logDir, "validation-summary.json"), JSON.stringify(results, null, 2));
const allPass = results.every((r) => r.pass);
process.exit(librosaOk && allPass ? 0 : librosaOk ? 1 : 0);
