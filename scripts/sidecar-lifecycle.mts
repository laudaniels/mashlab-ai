#!/usr/bin/env node
/** Single-instance MashLab sidecar launcher — start | stop | status */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { findSidecarLaunchPython } from "../src/domain/pythonRuntime.ts";
import {
  evaluateSidecarStatus,
  formatSidecarLifecycleMessage,
  isMashlabSidecarHealthy,
  isSidecarPortBusyFromNetstat,
  isSidecarPortListeningFromNetstat,
  parseSidecarHealthPayload,
  parseSidecarListenerPidFromNetstat,
  SIDECAR_BIND,
  SIDECAR_DEFAULT_HOST,
  SIDECAR_DEFAULT_PORT,
  SIDECAR_EXTERNAL_KILL_NOTICE,
  SIDECAR_HEALTH_URL,
  SIDECAR_STATUS_RELATIVE_PATH,
  sidecarRecoveryPid,
  sidecarStopSafetyNotice,
  type SidecarHealthPayload,
  type SidecarStatusFile,
  type SidecarStatusEvaluation,
} from "../src/domain/sidecarLifecycle.ts";

const execFileAsync = promisify(execFile);
const command = process.argv[2] ?? "status";
const rootDir = process.cwd();
const statusPath = join(rootDir, SIDECAR_STATUS_RELATIVE_PATH);
const serviceDir = join(rootDir, "local-engine/service");
const launchPython = findSidecarLaunchPython(rootDir, existsSync);
const venvPython = launchPython?.path ?? null;

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

async function readNetstat(): Promise<string> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 8000 });
      return stdout;
    } catch {
      return "";
    }
  }
  try {
    const { stdout } = await execFileAsync("ss", ["-ltn"], { timeout: 8000 });
    return stdout;
  } catch {
    return "";
  }
}

async function inspectSidecar(): Promise<SidecarStatusEvaluation> {
  const health = await fetchHealth();
  const netstat = await readNetstat();
  const recorded = readStatusFile();
  const portListening = isSidecarPortListeningFromNetstat(netstat);
  const portBusy = isSidecarPortBusyFromNetstat(netstat);
  const listenerPid = parseSidecarListenerPidFromNetstat(netstat);

  return evaluateSidecarStatus({
    health,
    portListening,
    portBusy,
    recordedPid: recorded?.pid ?? null,
    listenerPid,
  });
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

async function killPid(pid: number): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10000 });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
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

async function waitForPortFree(timeoutMs = 15000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const netstat = await readNetstat();
    if (!isSidecarPortListeningFromNetstat(netstat)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return !isSidecarPortListeningFromNetstat(await readNetstat());
}

async function recoverStaleSidecar(evaluation: SidecarStatusEvaluation): Promise<boolean> {
  const pid = sidecarRecoveryPid({
    recordedPid: evaluation.pid,
    listenerPid: evaluation.listenerPid,
  });
  if (!pid) {
    return false;
  }

  console.log(`Recovering stale MashLab sidecar (pid ${pid})…`);
  const stopped = await killPid(pid);
  clearStatusFile();
  const portFree = await waitForPortFree();
  if (!stopped) {
    console.error(`Could not stop stale sidecar pid ${pid}.`);
    return false;
  }
  if (!portFree) {
    console.error("Port 47831 is still listening after stale recovery attempt.");
    return false;
  }
  console.log("Stale sidecar cleared.");
  return true;
}

async function runStatus(): Promise<number> {
  const evaluation = await inspectSidecar();
  const recorded = readStatusFile();

  console.log("MashLab sidecar status");
  console.log(`Bind: ${SIDECAR_BIND}`);
  console.log(`State: ${evaluation.state}`);
  console.log(evaluation.message);
  if (evaluation.portListening) {
    console.log(`Port listening: yes${evaluation.listenerPid ? ` (pid ${evaluation.listenerPid})` : ""}`);
  } else if (evaluation.portBusy) {
    console.log("Port busy (TIME_WAIT or other non-listening socket): yes — not blocking start");
  } else {
    console.log("Port listening: no");
  }
  if (recorded) {
    console.log(`Recorded pid: ${recorded.pid}`);
    console.log(`Recorded python: ${recorded.python}`);
    console.log(`Started: ${recorded.started_at}`);
  }
  if (isMashlabSidecarHealthy(evaluation.health)) {
    console.log(`Service: ${evaluation.health?.service} v${evaluation.health?.version ?? "?"}`);
  }
  console.log(SIDECAR_EXTERNAL_KILL_NOTICE);
  return evaluation.state === "healthy" ? 0 : evaluation.state === "not_running" ? 0 : 1;
}

async function runStart(): Promise<number> {
  let evaluation = await inspectSidecar();

  if (evaluation.state === "healthy") {
    console.log(formatSidecarLifecycleMessage("healthy"));
    console.log(`No action taken — ${SIDECAR_BIND} is ready.`);
    return 0;
  }

  if (evaluation.state === "stale_mashlab_sidecar") {
    const recovered = await recoverStaleSidecar(evaluation);
    if (!recovered) {
      console.error("Could not recover stale MashLab sidecar automatically.");
      console.error(sidecarStopSafetyNotice());
      return 1;
    }
    evaluation = await inspectSidecar();
  }

  if (evaluation.portListening) {
    console.error(formatSidecarLifecycleMessage("port_occupied_unknown"));
    if (evaluation.listenerPid) {
      console.error(`Listener pid: ${evaluation.listenerPid}`);
    }
    console.error("Stop the other process or choose a different port before starting MashLab sidecar.");
    return 1;
  }

  if (!venvPython) {
    console.error("Sidecar venv python not found.");
    console.error("Create it: cd local-engine/service && python -m venv .venv && pip install -r requirements.txt");
    return 1;
  }

  console.log(formatSidecarLifecycleMessage("starting"));
  console.log(
    launchPython?.source === "rhythm_venv"
      ? `Using ${venvPython} (.venv-rhythm — madmom/Essentia verified rhythm available)`
      : `Using ${venvPython}`
  );

  const child = spawn(
    venvPython,
    ["-m", "uvicorn", "main:app", "--host", SIDECAR_DEFAULT_HOST, "--port", String(SIDECAR_DEFAULT_PORT), "--timeout-keep-alive", "3600"],
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
  const evaluation = await inspectSidecar();

  if (evaluation.state === "healthy") {
    const recorded = readStatusFile();
    // Health already confirmed this is the MashLab sidecar, so the LISTENING pid
    // from netstat is a safe fallback when the process was started externally
    // (no recorded pid file).
    const pid = recorded?.pid ?? evaluation.listenerPid ?? null;
    if (!pid) {
      console.error(
        "Sidecar is healthy but no pid was recorded and the listener pid could not be resolved. Stop the uvicorn process manually."
      );
      return 1;
    }

    const stopped = await killPid(pid);
    if (!stopped) {
      console.error(`Failed to stop pid ${pid}.`);
      return 1;
    }
    clearStatusFile();
    const portFree = await waitForPortFree();
    console.log(formatSidecarLifecycleMessage("stopped"));
    console.log(
      `Stopped MashLab sidecar pid ${pid}${recorded?.pid ? "" : " (resolved from listening port)"}.`
    );
    if (!portFree) {
      console.error("Warning: port 47831 still shows a listener after stop — re-check with npm run sidecar:status.");
      return 1;
    }
    return 0;
  }

  if (evaluation.state === "stale_mashlab_sidecar") {
    const pid = sidecarRecoveryPid({
      recordedPid: evaluation.pid,
      listenerPid: evaluation.listenerPid,
    });
    if (pid) {
      await killPid(pid);
      console.log(`Stopped stale MashLab sidecar pid ${pid}.`);
    }
    clearStatusFile();
    console.log(formatSidecarLifecycleMessage("stopped"));
    return 0;
  }

  clearStatusFile();
  console.log(formatSidecarLifecycleMessage("not_running"));
  return 0;
}

const exitCode =
  command === "start" ? await runStart() : command === "stop" ? await runStop() : await runStatus();

process.exit(exitCode);
