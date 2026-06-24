import { createBrowserOnlyStatus, parseCapabilitiesResponse } from "./capabilities.ts";
import type {
  CreateLocalJobRequest,
  LocalEngineConnectionStatus,
  LocalEngineHealth,
  LocalServiceJob,
  MetadataAnalysisResponse,
} from "./types.ts";
import { DEFAULT_LOCAL_ENGINE_URL, LOCAL_ENGINE_REQUEST_TIMEOUT_MS } from "./types.ts";

export class LocalEngineClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_LOCAL_ENGINE_URL) {
    this.baseUrl = baseUrl;
  }

  async probeConnection(): Promise<LocalEngineConnectionStatus> {
    try {
      const health = await this.checkHealth();
      if (!health?.ok) {
        return createBrowserOnlyStatus("Local helper service is not reachable.");
      }

      const capabilities = await this.getCapabilities();
      if (!capabilities) {
        return {
          online: true,
          mode: "local-service",
          health,
          capabilities: [],
          error: "Local service responded, but capabilities could not be parsed.",
        };
      }

      return {
        online: true,
        mode: "local-service",
        health,
        capabilities: capabilities.capabilities,
        error: null,
      };
    } catch {
      return createBrowserOnlyStatus("Local helper service is offline. Browser-only mode remains active.");
    }
  }

  async checkHealth(): Promise<LocalEngineHealth | null> {
    const response = await this.request("/health");
    if (!response?.ok) {
      return null;
    }

    const payload = (await response.json()) as LocalEngineHealth;
    return payload.ok ? payload : null;
  }

  async getCapabilities() {
    const response = await this.request("/v1/capabilities");
    if (!response?.ok) {
      return null;
    }

    return parseCapabilitiesResponse(await response.json());
  }

  async submitJob(request: CreateLocalJobRequest): Promise<LocalServiceJob | null> {
    const response = await this.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response?.ok) {
      return null;
    }

    return (await response.json()) as LocalServiceJob;
  }

  async getJob(jobId: string): Promise<LocalServiceJob | null> {
    const response = await this.request(`/v1/jobs/${encodeURIComponent(jobId)}`);
    if (!response?.ok) {
      return null;
    }

    return (await response.json()) as LocalServiceJob;
  }

  async analyzeMetadata(file: File, jobId?: string): Promise<MetadataAnalysisResponse | null> {
    const formData = new FormData();
    formData.append("file", file);
    const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";

    const response = await this.request(`/v1/analyze/metadata${query}`, {
      method: "POST",
      body: formData,
    });

    if (!response?.ok) {
      return null;
    }

    return (await response.json()) as MetadataAnalysisResponse;
  }

  private async request(path: string, init?: RequestInit): Promise<Response | null> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(LOCAL_ENGINE_REQUEST_TIMEOUT_MS),
      });
      return response;
    } catch {
      return null;
    }
  }
}

export const localEngineClient = new LocalEngineClient();

export async function probeLocalEngineConnection(
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): Promise<LocalEngineConnectionStatus> {
  return new LocalEngineClient(baseUrl).probeConnection();
}
