#!/usr/bin/env node
/** Windows one-command local demo — preflight, sidecar, Vite in separate window. */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
  buildDemoNextSteps,
  buildDemoStartBanner,
  evaluateDemoPreflight,
  formatDemoPreflightLine,
} from "../src/domain/localDemoStart.ts";
import { findExistingSidecarVenvPython } from "../src/domain/pythonRuntime.ts";
import {
  isMashlabSidecarHealthy,
  parseSidecarHealthPayload,
  SIDECAR_HEALTH_URL,
} from "../src/domain/sidecarLifecycle.ts";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCmd = process.platform === "win32" ? "node.exe" : "node";

async function commandOk(command: string, args: string[] = ["-version"]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 8000, shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

async function fetchSidecarHealthy(): Promise<boolean> {
  try {
    const response = await fetch(SIDECAR_HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      return false;
    }
    return isMashlabSidecarHealthy(parseSidecarHealthPayload(await response.json()));
  } catch {
    return false;
  }
}

async function runSidecarStart(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      nodeCmd,
      ["--experimental-strip-types", "scripts/sidecar-lifecycle.mts", "start"],
      { cwd: rootDir, stdio: "inherit", shell: process.platform === "win32" }
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function startViteDevServer(): void {
  if (process.platform === "win32") {
    const psCommand = `Set-Location '${rootDir.replace(/'/g, "''")}'; npm run dev`;
    spawn(
      "powershell.exe",
      ["-NoExit", "-Command", psCommand],
      { detached: true, stdio: "ignore", shell: false }
    ).unref();
    console.log("Started Vite in a new PowerShell window (npm run dev).");
    return;
  }

  spawn(npmCmd, ["run", "dev"], { cwd: rootDir, detached: true, stdio: "ignore", shell: true }).unref();
  console.log("Started Vite dev server in background (npm run dev).");
}

console.log("MashLab — start:local:windows");
console.log("================================");

const venvPython = findExistingSidecarVenvPython(rootDir, existsSync);
const ffmpegOk = await commandOk("ffmpeg");
const ffprobeOk = await commandOk("ffprobe");
const sidecarHealthy = await fetchSidecarHealthy();

const preflight = evaluateDemoPreflight({
  venvPythonExists: venvPython !== null,
  ffmpegAvailable: ffmpegOk,
  ffprobeAvailable: ffprobeOk,
  sidecarHealthy,
});

for (const check of preflight.checks) {
  console.log(formatDemoPreflightLine(check));
}

if (!preflight.ok) {
  console.error("");
  console.error("Preflight failed — fix the items above, then rerun npm run start:local:windows");
  console.error("Browser MVP may still work with npm run dev alone (no sidecar processing).");
  process.exit(1);
}

console.log("");
const sidecarExit = await runSidecarStart();
if (sidecarExit !== 0) {
  console.error("Sidecar start failed.");
  process.exit(sidecarExit);
}

console.log("");
for (const line of buildDemoStartBanner()) {
  console.log(line);
}

console.log("");
console.log("Next steps:");
for (const step of buildDemoNextSteps()) {
  console.log(step);
}

console.log("");
startViteDevServer();
