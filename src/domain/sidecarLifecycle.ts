export const SIDECAR_DEFAULT_HOST = "127.0.0.1";
export const SIDECAR_DEFAULT_PORT = 47831;
export const SIDECAR_BIND = `http://${SIDECAR_DEFAULT_HOST}:${SIDECAR_DEFAULT_PORT}`;
export const SIDECAR_HEALTH_URL = `${SIDECAR_BIND}/health`;
export const SIDECAR_CAPABILITIES_URL = `${SIDECAR_BIND}/v1/capabilities`;
export const SIDECAR_STATUS_RELATIVE_PATH = "local-engine/service/.work/sidecar-status.json";

export type SidecarLifecycleState =
  | "healthy"
  | "not_running"
  | "port_occupied_unknown"
  | "stale_mashlab_sidecar"
  | "starting"
  | "failed_to_start"
  | "stopped";

export interface SidecarHealthPayload {
  ok?: boolean;
  service?: string;
  version?: string;
  bind?: string;
  privacy?: string;
}

export interface SidecarStatusFile {
  pid: number;
  bind: string;
  started_at: string;
  python: string;
}

export interface SidecarStatusEvaluation {
  state: SidecarLifecycleState;
  message: string;
  health: SidecarHealthPayload | null;
  pid: number | null;
  listenerPid: number | null;
  portListening: boolean;
  portBusy: boolean;
}

export function parseSidecarHealthPayload(raw: unknown): SidecarHealthPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw as SidecarHealthPayload;
  return payload;
}

export function isMashlabSidecarHealthy(health: SidecarHealthPayload | null): boolean {
  return health?.ok === true && health?.service === "mashlab-local-engine";
}

export function formatSidecarLifecycleMessage(state: SidecarLifecycleState): string {
  switch (state) {
    case "healthy":
      return "Sidecar is already running and healthy.";
    case "not_running":
      return "Sidecar is not running on the default bind.";
    case "port_occupied_unknown":
      return "Port 47831 is listening but the MashLab sidecar health check did not respond, and no MashLab pid is recorded.";
    case "stale_mashlab_sidecar":
      return "Port 47831 is listening but the MashLab sidecar health check did not respond. A stale MashLab sidecar process may need recovery.";
    case "starting":
      return "Starting MashLab sidecar…";
    case "failed_to_start":
      return "Sidecar failed to start or did not become healthy in time.";
    case "stopped":
      return "Sidecar stop requested.";
    default:
      return "Unknown sidecar state.";
  }
}

export function isSidecarPortListeningFromNetstat(
  netstatStdout: string,
  host: string = SIDECAR_DEFAULT_HOST,
  port: number = SIDECAR_DEFAULT_PORT
): boolean {
  return parseSidecarListenerPidFromNetstat(netstatStdout, host, port) !== null;
}

export function parseSidecarListenerPidFromNetstat(
  netstatStdout: string,
  host: string = SIDECAR_DEFAULT_HOST,
  port: number = SIDECAR_DEFAULT_PORT
): number | null {
  const needle = `${host}:${port}`;
  for (const line of netstatStdout.split(/\r?\n/)) {
    if (!line.includes("LISTENING") || !line.includes(needle)) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) {
      return pid;
    }
  }
  return null;
}

/** Any netstat line referencing the bind — includes TIME_WAIT (diagnostics only). */
export function isSidecarPortBusyFromNetstat(
  netstatStdout: string,
  host: string = SIDECAR_DEFAULT_HOST,
  port: number = SIDECAR_DEFAULT_PORT
): boolean {
  return netstatStdout.includes(`${host}:${port}`);
}

export function evaluateSidecarStatus(input: {
  health: SidecarHealthPayload | null;
  portListening: boolean;
  portBusy?: boolean;
  recordedPid: number | null;
  listenerPid?: number | null;
}): SidecarStatusEvaluation {
  const listenerPid = input.listenerPid ?? null;
  const portBusy = input.portBusy ?? input.portListening;

  if (isMashlabSidecarHealthy(input.health)) {
    return {
      state: "healthy",
      message: formatSidecarLifecycleMessage("healthy"),
      health: input.health,
      pid: input.recordedPid,
      listenerPid,
      portListening: input.portListening,
      portBusy,
    };
  }

  if (input.portListening) {
    if (input.recordedPid !== null) {
      return {
        state: "stale_mashlab_sidecar",
        message: formatSidecarLifecycleMessage("stale_mashlab_sidecar"),
        health: input.health,
        pid: input.recordedPid,
        listenerPid,
        portListening: true,
        portBusy,
      };
    }

    return {
      state: "port_occupied_unknown",
      message: formatSidecarLifecycleMessage("port_occupied_unknown"),
      health: input.health,
      pid: input.recordedPid,
      listenerPid,
      portListening: true,
      portBusy,
    };
  }

  return {
    state: "not_running",
    message: formatSidecarLifecycleMessage("not_running"),
    health: input.health,
    pid: input.recordedPid,
    listenerPid,
    portListening: false,
    portBusy,
  };
}

export function sidecarRecoveryPid(input: {
  recordedPid: number | null;
  listenerPid: number | null;
}): number | null {
  return input.recordedPid ?? input.listenerPid;
}

export function sidecarStopSafetyNotice(): string {
  return "npm run sidecar:stop stops a healthy MashLab sidecar when the health check identifies it, or clears a stale recorded pid when health is offline. If port 47831 is held by another app, stop that process manually.";
}

export const SIDECAR_EXTERNAL_KILL_NOTICE =
  "Windows exit code 4294967295 (-1) usually means the sidecar process was stopped externally (terminal closed, duplicate restart, or manual kill) — not a dependency install failure.";

export function includesNoPublicSharingLanguage(text: string): boolean {
  return /no public sharing|public sharing|cloud upload|streaming import/i.test(text);
}
