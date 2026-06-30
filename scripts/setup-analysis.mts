#!/usr/bin/env node
/** Optional librosa / analysis dependency setup in the sidecar venv. */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
  ANALYSIS_SETUP_GUIDANCE,
  findExistingSidecarVenvPython,
  PYTHON_MISSING_GUIDANCE,
} from "../src/domain/pythonRuntime.ts";

const execFileAsync = promisify(execFile);
const dryRun = process.argv.includes("--dry-run");

const venvPython = findExistingSidecarVenvPython(process.cwd(), existsSync);
const requirements = "local-engine/service/requirements-analysis.txt";

console.log("MashLab optional analysis setup (librosa BPM/key prototype)");
console.log("Not required for browser MVP upload/planning.");
console.log("");

if (!venvPython) {
  console.error("Sidecar venv not found.");
  console.error(PYTHON_MISSING_GUIDANCE);
  process.exit(1);
}

if (!existsSync(requirements)) {
  console.error(`Missing ${requirements}`);
  process.exit(1);
}

if (dryRun) {
  console.log(ANALYSIS_SETUP_GUIDANCE);
  console.log(`Would run: ${venvPython} -m pip install -r ${requirements}`);
  process.exit(0);
}

console.log(`Using: ${venvPython}`);
console.log(`Installing from ${requirements} …`);

try {
  await execFileAsync(venvPython, ["-m", "pip", "install", "-r", requirements], {
    timeout: 600000,
    cwd: process.cwd(),
  });
  await execFileAsync(venvPython, ["-c", "import librosa; print(librosa.__version__)"], { timeout: 30000 });
  console.log("librosa installed in sidecar venv — BPM/key/heuristic phrase lanes available.");
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Analysis setup failed: ${message}`);
  console.error(ANALYSIS_SETUP_GUIDANCE);
  process.exit(1);
}
