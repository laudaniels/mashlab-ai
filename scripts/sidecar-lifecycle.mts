#!/usr/bin/env node
/** Single-instance MashLab sidecar launcher — start | stop | status */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { findExistingSidecarVenvPython } from "../src/domain/pythonRuntime.ts";
import {
  evaluateSidecarStatus,
  formatSidecarLifecycleMessage,
  isMashlabSidecarHealthy,
  parseSidecarHealthPayload,
  SIDECAR_BIND,
  SIDECAR_DEFAULT_HOST,
  SIDECAR_DEFAULT_PORT,
  SIDECAR_EXTERNAL_KILL_NOTICE,
  SIDECAR_HEALTH_URL,
  SIDECAR_STATUS_RELATIVE_PATH,
  sidecarStopSafetyNotice,
  type SidecarHealthPayload,
  type SidecarStatusFile,
} from "../src/domain/sidecarLifecycle.ts";

const execFileAsync = promisify(execFile);
const command = process.argv[2] ?? "status";
const rootDir = process.cwd();
const statusPath = join(rootDir, SIDECAR_STATUS_RELATIVE_PATH);
const serviceDir = join(rootDir, "local-engine/service");
const venvPython = findExistingSidecarVenvPython(rootDir, existsSync);

async function fetchHealth(): Promise<SidecarHealthPayload | null> {
  try {
    const response = await fetch(SIDECAR_HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      return null;
    }
    return parseSidecarHealthPayload(await response.json());
  } catch {
    return null;
  }
}

async function isPortInUse(): Promise<boolean> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 8000 });
      return stdout.includes(`${SIDECAR_DEFAULT_HOST}:${SIDECAR_DEFAULT_PORT}`);
    } catch {
      return false;
    }
  }
  try {
    const { stdout } = await execFileAsync("ss", ["-ltn"], { timeout: 8000 });
    return stdout.includes(`:${SIDECAR_DEFAULT_PORT}`);
  } catch {
    return false;
  }
}

function readStatusFile(): SidecarStatusFile | null {
  if (!existsSync(statusPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(statusPath, "utf8")) as SidecarStatusFile;
  } catch {
    return null;
  }
}

function writeStatusFile(payload: SidecarStatusFile): void {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function clearStatusFile(): void {
  if (existsSync(statusPath)) {
    unlinkSync(statusPath);
  }
}

async function waitForHealthy(timeoutMs = 20000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const health = await fetchHealth();
    if (isMashlabSidecarHealthy(health)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function runStatus(): Promise<number> {
  const health = await fetchHealth();
  const portInUse = await isPortInUse();
  const recorded = readStatusFile();
  const evaluation = evaluateSidecarStatus({
    health,
    portInUse,
    recordedPid: recorded?.pid ?? null,
  });

  console.log("MashLab sidecar status");
  console.log(`Bind: ${SIDECAR_BIND}`);
  console.log(`State: ${evaluation.state}`);
  console.log(evaluation.message);
  if (recorded) {
    console.log(`Recorded pid: ${recorded.pid}`);
    console.log(`Recorded python: ${recorded.python}`);
    console.log(`Started: ${recorded.started_at}`);
  }
  if (isMashlabSidecarHealthy(health)) {
    console.log(`Service: ${health?.service} v${health?.version ?? "?"}`);
  }
  console.log(SIDECAR_EXTERNAL_KILL_NOTICE);
  return evaluation.state === "healthy" ? 0 : evaluation.state === "not_running" ? 0 : 1;
}

async function runStart(): Promise<number> {
  const health = await fetchHealth();
  const portInUse = await isPortInUse();

  if (isMashlabSidecarHealthy(health)) {
    console.log(formatSidecarLifecycleMessage("healthy"));
    console.log(`No action taken — ${SIDECAR_BIND} is ready.`);
    return 0;
  }

  if (portInUse) {
    console.error(formatSidecarLifecycleMessage("port_occupied_unknown"));
    console.error("Stop the other process or choose a different port before starting MashLab sidecar.");
    return 1;
  }

  if (!venvPython) {
    console.error("Sidecar venv python not found.");
    console.error("Create it: cd local-engine/service && python -m venv .venv && pip install -r requirements.txt");
    return 1;
  }

  console.log(formatSidecarLifecycleMessage("starting"));
  console.log(`Using ${venvPython}`);

  const child = spawn(
    venvPython,
    ["-m", "uvicorn", "main:app", "--host", SIDECAR_DEFAULT_HOST, "--port", String(SIDECAR_DEFAULT_PORT)],
    {
      cwd: serviceDir,
      detached: true,
      stdio: "ignore",
      env: process.env,
    }
  );
  child.unref();

  if (!child.pid) {
    console.error(formatSidecarLifecycleMessage("failed_to_start"));
    return 1;
  }

  writeStatusFile({
    pid: child.pid,
    bind: SIDECAR_BIND,
    started_at: new Date().toISOString(),
    python: venvPython,
  });

  const healthy = await waitForHealthy();
  if (!healthy) {
    console.error(formatSidecarLifecycleMessage("failed_to_start"));
    return 1;
  }

  console.log(`Sidecar started (pid ${child.pid}) — ${SIDECAR_BIND}`);
  return 0;
}

async function runStop(): Promise<number> {
  console.log(sidecarStopSafetyNotice());
  const health = await fetchHealth();
  if (!isMashlabSidecarHealthy(health)) {
    clearStatusFile();
    console.log(formatSidecarLifecycleMessage("not_running"));
    return 0;
  }

  const recorded = readStatusFile();
  const pid = recorded?.pid;
  if (!pid) {
    console.error("Sidecar is healthy but no pid is recorded. Stop the uvicorn process manually.");
    return 1;
  }

  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10000 });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to stop pid ${pid}: ${message}`);
    return 1;
  }

  clearStatusFile();
  console.log(formatSidecarLifecycleMessage("stopped"));
  console.log(`Stopped MashLab sidecar pid ${pid}.`);
  return 0;
}

const exitCode =
  command === "start" ? await runStart() : command === "stop" ? await runStop() : await runStatus();

process.exit(exitCode);
