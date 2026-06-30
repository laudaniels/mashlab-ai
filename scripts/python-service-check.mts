#!/usr/bin/env node
/** Compile or test the Python sidecar — prefers sidecar venv when global python is missing. */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
  findExistingSidecarVenvPython,
  formatPythonResolutionLabel,
  PYTHON_MISSING_GUIDANCE,
  PYTHON_SERVICE_COMPILE_TARGETS,
  resolvePythonForChecks,
} from "../src/domain/pythonRuntime.ts";

const execFileAsync = promisify(execFile);
const mode = process.argv[2] === "test" ? "test" : "compile";
const venvOnly = process.argv.includes("--venv");

async function globalPythonAvailable(): Promise<boolean> {
  try {
    await execFileAsync("python", ["--version"], { timeout: 8000, shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

const rootDir = process.cwd();
const venvPython = findExistingSidecarVenvPython(rootDir, existsSync);
const globalOk = await globalPythonAvailable();
const resolution = resolvePythonForChecks({
  globalPythonAvailable: globalOk,
  venvPythonPath: venvPython,
  preferVenv: true,
  venvOnly,
});

console.log(`MashLab Python service check (${mode})`);
console.log(`Python source: ${formatPythonResolutionLabel(resolution)}`);

if (!resolution.command) {
  console.error(PYTHON_MISSING_GUIDANCE);
  process.exit(1);
}

try {
  if (mode === "compile") {
    await execFileAsync(resolution.command, ["-m", "py_compile", ...PYTHON_SERVICE_COMPILE_TARGETS], {
      timeout: 120000,
      cwd: rootDir,
    });
    console.log(`py_compile OK (${PYTHON_SERVICE_COMPILE_TARGETS.length} modules)`);
  } else {
    await execFileAsync(resolution.command, ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], {
      timeout: 300000,
      cwd: `${rootDir}/local-engine/service`,
    });
    console.log("unittest discover OK");
  }
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Python service check failed: ${message}`);
  process.exit(1);
}
