#!/usr/bin/env node
/** Desktop runtime probe — same checks the Electron shell performs on launch. */
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildDesktopLaunchBanner,
  DESKTOP_UI_URL,
  evaluateDesktopRuntimeChecks,
  formatDesktopRuntimeCheckLine,
  resolveDesktopVenvPython,
  type DesktopRuntimeProbe,
} from "../src/domain/desktopPackaging.ts";
import { findExistingSidecarVenvPython } from "../src/domain/pythonRuntime.ts";
import { isMashlabSidecarHealthy, parseSidecarHealthPayload, SIDECAR_HEALTH_URL } from "../src/domain/sidecarLifecycle.ts";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();

async function commandOk(command: string, args: string[] = ["-version"]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 8000, shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

async function findRubberBand(): Promise<boolean> {
  const names =
    process.platform === "win32"
      ? ["rubberband.exe", "rubberband-cli.exe", "rubberband", "rubberband-cli"]
      : ["rubberband", "rubberband-cli"];
  for (const name of names) {
    if (await commandOk(name, ["--version"])) {
      return true;
    }
  }
  return false;
}

async function pythonImportOk(pythonCommand: string, moduleName: string): Promise<boolean> {
  try {
    await execFileAsync(pythonCommand, ["-c", `import ${moduleName}`], { timeout: 20000 });
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

const venvPython = findExistingSidecarVenvPython(rootDir, existsSync);
const probe: DesktopRuntimeProbe = {
  venvPythonExists: venvPython !== null,
  ffmpegAvailable: await commandOk("ffmpeg"),
  ffprobeAvailable: await commandOk("ffprobe"),
  rubberBandAvailable: await findRubberBand(),
  sidecarHealthy: await fetchSidecarHealthy(),
  torchAvailable: venvPython ? await pythonImportOk(venvPython, "torch") : false,
  demucsAvailable: venvPython ? await pythonImportOk(venvPython, "demucs") : false,
};

const evaluation = evaluateDesktopRuntimeChecks(probe);

console.log("MashLab desktop runtime check");
console.log(`Packaged venv path: ${resolveDesktopVenvPython(rootDir)}`);
console.log("");

for (const check of evaluation.checks) {
  console.log(formatDesktopRuntimeCheckLine(check));
  if (check.setupGuidance) {
    console.log(`  setup: ${check.setupGuidance}`);
  }
}

console.log("");
console.log(`Can launch UI: ${evaluation.canLaunchUi ? "yes" : "no"}`);
console.log(`Can process audio: ${evaluation.canProcessAudio ? "yes" : "no"}`);
console.log("");
for (const line of buildDesktopLaunchBanner(DESKTOP_UI_URL)) {
  console.log(line);
}

const strict = process.argv.includes("--strict");
const blocking = evaluation.checks.filter((check) => check.blocking && !check.pass);
process.exit(strict && blocking.length > 0 ? 1 : 0);
