import { createBrowserOnlyStatus, parseCapabilitiesResponse } from "./capabilities.ts";
import { parseBeatAnalysisResponse, parseKeyAnalysisResponse } from "./analysis.ts";
import {
  buildPreviewFormData,
  parsePitchTimePreviewResponse,
} from "./pitchTimePreview.ts";
import {
  buildStemPreviewFormData,
  parseStemPreviewResponse,
} from "./stemPreview.ts";
import { parseCombinedPreviewResponse } from "./combinedPreview.ts";
import {
  parseArtifactDeleteResponse,
  parseArtifactListResponse,
  parseArtifactMetadataResponse,
} from "./artifacts.ts";
import {
  getCachedBeatAnalysis,
  getCachedKeyAnalysis,
  setCachedBeatAnalysis,
  setCachedKeyAnalysis,
} from "./analysisCache.ts";
import type {
  BeatAnalysisResponse,
  CreateLocalJobRequest,
  KeyAnalysisResponse,
  LocalEngineConnectionStatus,
  LocalEngineHealth,
  LocalServiceJob,
  MetadataAnalysisResponse,
} from "./types.ts";
import {
  DEFAULT_LOCAL_ENGINE_URL,
  LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS,
  LOCAL_ENGINE_REQUEST_TIMEOUT_MS,
} from "./types.ts";
import type { PitchTimePreviewRequestParams } from "../../domain/pitchTimePreview.ts";
import type { PitchTimePreviewResult } from "../../domain/pitchTimePreview.ts";
import type { StemPreviewRequestParams } from "../../domain/stemPreview.ts";
import type { StemPreviewResult } from "../../domain/stemPreview.ts";
import type { CombinedPreviewRequestParams } from "../../domain/combinedPreview.ts";
import type { CombinedPreviewResult } from "../../domain/combinedPreview.ts";
import type { PreviewArtifactRegistryEntry } from "../../domain/previewArtifacts.ts";

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
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS,
    });

    if (!response?.ok) {
      return null;
    }

    return (await response.json()) as MetadataAnalysisResponse;
  }

  async analyzeBeat(file: File, inspectionId?: string): Promise<BeatAnalysisResponse | null> {
    const cached = getCachedBeatAnalysis<BeatAnalysisResponse | null>(file, inspectionId);
    if (cached) {
      return cached;
    }

    const request = this.requestBeatAnalysis(file);
    return setCachedBeatAnalysis(file, request, inspectionId);
  }

  async analyzeKey(file: File, inspectionId?: string): Promise<KeyAnalysisResponse | null> {
    const cached = getCachedKeyAnalysis<KeyAnalysisResponse | null>(file, inspectionId);
    if (cached) {
      return cached;
    }

    const request = this.requestKeyAnalysis(file);
    return setCachedKeyAnalysis(file, request, inspectionId);
  }

  async processPitchTimePreview(
    file: File,
    params: PitchTimePreviewRequestParams
  ): Promise<PitchTimePreviewResult | null> {
    const formData = buildPreviewFormData(file, params);

    const response = await this.request("/v1/process/pitch-time-preview", {
      method: "POST",
      body: formData,
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 2,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parsePitchTimePreviewResponse(payload, this.baseUrl);
  }

  async processStemPreview(
    file: File,
    params: StemPreviewRequestParams
  ): Promise<StemPreviewResult | null> {
    const formData = buildStemPreviewFormData(file, params);

    const response = await this.request("/v1/process/stem-preview", {
      method: "POST",
      body: formData,
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseStemPreviewResponse(payload, this.baseUrl);
  }

  async processCombinedPreview(
    params: CombinedPreviewRequestParams
  ): Promise<CombinedPreviewResult | null> {
    const response = await this.request("/v1/process/combined-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mash_intent: params.mashIntent,
        source_vocal_artifact_id: params.sourceVocalArtifactId,
        target_instrumental_artifact_id: params.targetInstrumentalArtifactId,
        tempo_ratio: params.tempoRatio,
        source_bpm: params.sourceBpm,
        target_bpm: params.targetBpm,
        pitch_shift_semitones: params.pitchShiftSemitones,
        alignment_offset_ms: params.alignmentOffsetMs,
        max_preview_seconds: params.maxPreviewSeconds,
        formant_preservation: params.formantPreservation,
        neutral_processing: params.neutralProcessing,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseCombinedPreviewResponse(payload, this.baseUrl);
  }

  async listArtifacts(registry: PreviewArtifactRegistryEntry[] = []) {
    const response = await this.request("/v1/artifacts");
    if (!response) {
      return [];
    }

    const payload = await response.json();
    return parseArtifactListResponse(payload, this.baseUrl, registry);
  }

  async getArtifactMetadata(artifactId: string) {
    const response = await this.request(`/v1/artifacts/${encodeURIComponent(artifactId)}/metadata`, {
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 3,
    });
    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseArtifactMetadataResponse(payload, this.baseUrl);
  }

  async deleteArtifact(artifactId: string) {
    const response = await this.request(`/v1/artifacts/${encodeURIComponent(artifactId)}`, {
      method: "DELETE",
    });
    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseArtifactDeleteResponse(payload);
  }

  async clearPreviewArtifacts() {
    const response = await this.request("/v1/artifacts?scope=session", {
      method: "DELETE",
    });
    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseArtifactDeleteResponse(payload);
  }

  private async requestBeatAnalysis(file: File): Promise<BeatAnalysisResponse | null> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await this.request("/v1/analyze/beat", {
      method: "POST",
      body: formData,
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseBeatAnalysisResponse(payload);
  }

  private async requestKeyAnalysis(file: File): Promise<KeyAnalysisResponse | null> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await this.request("/v1/analyze/key", {
      method: "POST",
      body: formData,
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseKeyAnalysisResponse(payload);
  }

  private async request(
    path: string,
    init?: RequestInit & { timeoutMs?: number }
  ): Promise<Response | null> {
    const timeoutMs = init?.timeoutMs ?? LOCAL_ENGINE_REQUEST_TIMEOUT_MS;

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
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
