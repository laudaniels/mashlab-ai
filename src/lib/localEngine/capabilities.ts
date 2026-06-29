import type {
  CapabilityStatus,
  LocalEngineCapabilitiesResponse,
  LocalEngineConnectionStatus,
  ServiceCapability,
} from "./types.ts";

export function createBrowserOnlyStatus(error: string | null = null): LocalEngineConnectionStatus {
  return {
    online: false,
    mode: "browser-only",
    health: null,
    capabilities: [],
    error,
  };
}

export function parseCapabilitiesResponse(
  payload: unknown
): LocalEngineCapabilitiesResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.capabilities)) {
    return null;
  }

  const capabilities = record.capabilities
    .map(parseServiceCapability)
    .filter((capability): capability is ServiceCapability => capability !== null);

  if (typeof record.service !== "string" || typeof record.version !== "string") {
    return null;
  }

  return {
    service: record.service,
    version: record.version,
    python_version: typeof record.python_version === "string" ? record.python_version : "unknown",
    capabilities,
  };
}

export function parseServiceCapability(value: unknown): ServiceCapability | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.message !== "string" ||
    !isCapabilityStatus(record.status)
  ) {
    return null;
  }

  return {
    id: record.id,
    label: record.label,
    status: record.status,
    message: record.message,
    version: typeof record.version === "string" ? record.version : null,
  };
}

export function summarizeCapabilities(capabilities: ServiceCapability[]): string {
  if (capabilities.length === 0) {
    return "No local capabilities reported.";
  }

  const available = capabilities.filter((capability) => capability.status === "available").length;
  return `${available}/${capabilities.length} local capabilities available`;
}

export function findCapability(
  capabilities: ServiceCapability[],
  capabilityId: string
): ServiceCapability | undefined {
  return capabilities.find((capability) => capability.id === capabilityId);
}

export function isRubberBandAvailable(capabilities: ServiceCapability[]): boolean {
  return findCapability(capabilities, "rubberband")?.status === "available";
}

export function isDemucsAvailable(capabilities: ServiceCapability[]): boolean {
  return findCapability(capabilities, "demucs")?.status === "available";
}

export function demucsCapabilitySummary(capabilities: ServiceCapability[]): {
  status: ServiceCapability["status"] | "unknown";
  message: string;
} {
  const demucs = findCapability(capabilities, "demucs");
  if (!demucs) {
    return {
      status: "unknown",
      message: "Demucs readiness unknown. Stem preview remains disabled until the sidecar reports status.",
    };
  }

  return {
    status: demucs.status,
    message: demucs.message,
  };
}

export function rubberBandCapabilitySummary(capabilities: ServiceCapability[]): {
  status: ServiceCapability["status"] | "unknown";
  message: string;
} {
  const rubberBand = findCapability(capabilities, "rubberband");
  if (!rubberBand) {
    return {
      status: "unknown",
      message: "Rubber Band readiness unknown. Browser-only planning remains available.",
    };
  }

  return {
    status: rubberBand.status,
    message: rubberBand.message,
  };
}

function isCapabilityStatus(value: unknown): value is CapabilityStatus {
  return (
    value === "available" ||
    value === "missing" ||
    value === "not_configured" ||
    value === "planned"
  );
}
