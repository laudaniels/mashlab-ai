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
  portInUse: boolean;
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
      return "Port 47831 is in use but the MashLab sidecar health check did not respond.";
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

export function evaluateSidecarStatus(input: {
  health: SidecarHealthPayload | null;
  portInUse: boolean;
  recordedPid: number | null;
}): SidecarStatusEvaluation {
  if (isMashlabSidecarHealthy(input.health)) {
    return {
      state: "healthy",
      message: formatSidecarLifecycleMessage("healthy"),
      health: input.health,
      pid: input.recordedPid,
      portInUse: input.portInUse,
    };
  }

  if (input.portInUse) {
    return {
      state: "port_occupied_unknown",
      message: formatSidecarLifecycleMessage("port_occupied_unknown"),
      health: input.health,
      pid: input.recordedPid,
      portInUse: true,
    };
  }

  return {
    state: "not_running",
    message: formatSidecarLifecycleMessage("not_running"),
    health: input.health,
    pid: input.recordedPid,
    portInUse: false,
  };
}

export function sidecarStopSafetyNotice(): string {
  return "npm run sidecar:stop only stops a sidecar whose health check identifies MashLab. If port 47831 is held by another app, stop that process manually.";
}

export const SIDECAR_EXTERNAL_KILL_NOTICE =
  "Windows exit code 4294967295 (-1) usually means the sidecar process was stopped externally (terminal closed, duplicate restart, or manual kill) — not a dependency install failure.";

export function includesNoPublicSharingLanguage(text: string): boolean {
  return /no public sharing|public sharing|cloud upload|streaming import/i.test(text);
}
