#!/usr/bin/env node
/** Rhythm self-test curl harness — strict/non-strict, no user audio. */
import {
  formatRhythmEngineSelfTestLine,
  RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE,
} from "../src/domain/rhythmSelfTest.ts";
import {
  evaluateSelfTestHarnessExit,
  formatSelfTestStatusMeaning,
  parseSidecarUrl,
  parseStrictModeFlag,
} from "../src/domain/wslSidecarProfile.ts";
import { parseRhythmSelfTestResponse } from "../src/lib/localEngine/rhythmSelfTest.ts";

const strict = parseStrictModeFlag(process.argv.slice(2));
const baseUrl = parseSidecarUrl(process.argv.slice(2));
const selfTestUrl = `${baseUrl}/v1/capabilities/rhythm-selftest`;

console.log("MashLab rhythm self-test harness");
console.log(`Mode: ${strict ? "strict" : "non-strict (default on Windows/no-WSL)"}`);
console.log(RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE);
console.log(`URL: ${selfTestUrl}`);
console.log("");

let sidecarReachable = false;
try {
  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
  sidecarReachable = health.ok;
} catch {
  sidecarReachable = false;
}

if (!sidecarReachable) {
  console.log(`Sidecar not reachable at ${baseUrl}`);
  console.log("Start sidecar: npm run sidecar:wsl  OR  cd local-engine/service && uvicorn main:app --port 47831");
  process.exit(evaluateSelfTestHarnessExit(null, { strict, sidecarReachable: false }));
}

const response = await fetch(selfTestUrl, { signal: AbortSignal.timeout(120000) });
if (!response.ok) {
  console.error(`Self-test HTTP ${response.status}`);
  process.exit(strict ? 1 : 0);
}

const payload = await response.json();
const parsed = parseRhythmSelfTestResponse(payload);

if (!parsed) {
  console.error("Could not parse rhythm self-test response.");
  process.exit(strict ? 1 : 0);
}

console.log(`Platform: ${parsed.platform}`);
console.log(`Python: ${parsed.pythonVersion}`);
console.log(`Test signal: ${parsed.testSignal.replace(/_/g, " ")}`);
console.log(`Heuristic fallback: ${parsed.heuristicFallbackAvailable ? "available" : "unavailable"}`);
console.log(`Verified downbeat: ${parsed.verifiedDownbeatAvailable ? "available" : "not available"}`);
console.log(`Verified phrase: ${parsed.verifiedPhraseAvailable ? "available" : "not available"}`);
console.log("");

for (const result of parsed.results) {
  console.log(formatRhythmEngineSelfTestLine(result));
  console.log(`  meaning: ${formatSelfTestStatusMeaning(result.smokeTestStatus)}`);
  if (result.message) {
    console.log(`  message: ${result.message}`);
  }
  if (result.setupGuidance && result.smokeTestStatus !== "pass") {
    console.log(`  setup: ${result.setupGuidance}`);
  }
  console.log("");
}

process.exit(
  evaluateSelfTestHarnessExit(parsed, {
    strict,
    sidecarReachable: true,
  })
);
