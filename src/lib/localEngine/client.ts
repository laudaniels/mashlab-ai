import { createBrowserOnlyStatus, parseCapabilitiesResponse } from "./capabilities.ts";
import { parseBeatAnalysisResponse, parseKeyAnalysisResponse, parsePhraseAnalysisResponse } from "./analysis.ts";
import {
  buildPreviewFormData,
  parsePitchTimePreviewResponse,
} from "./pitchTimePreview.ts";
import {
  buildStemPreviewFormData,
  parseStemPreviewResponse,
} from "./stemPreview.ts";
import { parseCombinedPreviewResponse } from "./combinedPreview.ts";
import { parseMasterWavResponse } from "./mastering.ts";
import { parseExportWavResponse, parseFullWavExportResponse, parseMp3ExportResponse, parseSectionWavExportResponse } from "./export.ts";
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
  LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS,
  createLocalEngineAbortSignal,
} from "./types.ts";
import type { PitchTimePreviewRequestParams } from "../../domain/pitchTimePreview.ts";
import type { PitchTimePreviewResult } from "../../domain/pitchTimePreview.ts";
import type { StemPreviewRequestParams } from "../../domain/stemPreview.ts";
import type { StemPreviewResult } from "../../domain/stemPreview.ts";
import type { CombinedPreviewRequestParams } from "../../domain/combinedPreview.ts";
import { serializeCombinedPreviewRequestBody } from "../../domain/combinedPreview.ts";
import type { CombinedPreviewResult } from "../../domain/combinedPreview.ts";
import type { PreviewArtifactRegistryEntry } from "../../domain/previewArtifacts.ts";
import type { ExportWavRequestParams } from "../../domain/localExport.ts";
import { serializeArrangementContextForApi } from "../../domain/arrangementSectionContext.ts";
import type { ExportWavResult } from "../../domain/localExport.ts";
import type { FullLengthExportRequestParams } from "../../domain/fullLengthExport.ts";
import { mixSettingsToRequestFields } from "../../domain/mixControls.ts";
import type { FullLengthExportResult } from "../../domain/fullLengthExport.ts";
import type { MasterWavRequestParams } from "../../domain/masteringPresets.ts";
import type { MasterWavResult } from "../../domain/masteringPresets.ts";
import type { Mp3ExportRequestParams } from "../../domain/mp3Export.ts";
import type { Mp3ExportResult } from "../../domain/mp3Export.ts";
import type { SectionExportRequestParams } from "../../domain/sectionExport.ts";
import type { SectionExportResult } from "../../domain/sectionExport.ts";
import type { PhraseAnalysisMethodPreference } from "../../domain/phraseAnalysis.ts";
import { phraseAnalysisFromApiResult } from "../../domain/phraseAnalysis.ts";
import type { PhraseAnalysisResult } from "../../domain/phraseAnalysis.ts";
import type { PackageExportResult, PackageExportRequestParams } from "../../domain/projectPackage.ts";
import { parsePackageExportResponse } from "./package.ts";
import { parseRhythmSelfTestResponse } from "./rhythmSelfTest.ts";
import type { RhythmSelfTestResponse } from "../../domain/rhythmSelfTest.ts";
import { parseRemixBrainPlanResponse } from "./remixBrain.ts";
import type { RemixBrainPlanRequest, RemixBrainPlanResult } from "../../domain/remixBrain.ts";
import { parseArrangementBrainPlanResponse } from "./arrangementBrain.ts";
import type { ArrangementBrainPlanResult, ArrangementStyle } from "../../domain/arrangementBrain.ts";

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

  async runRhythmSelfTest(): Promise<RhythmSelfTestResponse | null> {
    const response = await this.request("/v1/capabilities/rhythm-selftest", {
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS,
    });
    if (!response?.ok) {
      return null;
    }

    return parseRhythmSelfTestResponse(await response.json());
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

  async analyzePhrases(params: {
    file?: File | null;
    bpm?: number | null;
    beatTimes?: number[];
    phraseLengthBars?: 4 | 8 | 16;
    method?: PhraseAnalysisMethodPreference;
  }): Promise<{ response: import("./types.ts").PhraseAnalysisResponse | null; result: PhraseAnalysisResult | null }> {
    const formData = new FormData();
    if (params.file) {
      formData.append("file", params.file);
    }
    if (params.bpm !== null && params.bpm !== undefined) {
      formData.append("bpm", String(params.bpm));
    }
    if (params.beatTimes && params.beatTimes.length > 0) {
      formData.append("beat_times", JSON.stringify(params.beatTimes));
    }
    formData.append("phrase_length_bars", String(params.phraseLengthBars ?? 8));
    formData.append("method", params.method ?? "auto");

    const response = await this.request("/v1/analyze/phrases", {
      method: "POST",
      body: formData,
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 2,
    });

    if (!response) {
      return { response: null, result: null };
    }

    const payload = await response.json();
    const parsed = parsePhraseAnalysisResponse(payload);
    if (!parsed?.ok || !parsed.result) {
      return { response: parsed, result: null };
    }

    return {
      response: parsed,
      result: phraseAnalysisFromApiResult(parsed.result),
    };
  }

  async planRemixBrain(params: RemixBrainPlanRequest): Promise<RemixBrainPlanResult | null> {
    const response = await this.request("/v1/plan/remix-brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_vocal_stem_artifact_id: params.sourceVocalStemArtifactId,
        target_instrumental_stem_artifact_id: params.targetInstrumentalStemArtifactId,
        section_start_sec: params.sectionStartSec ?? null,
        section_duration_sec: params.sectionDurationSec ?? null,
        offset_ms: params.offsetMs ?? 0,
        pitch_shift_semitones: params.pitchShiftSemitones ?? null,
        downbeat_shift: params.downbeatShift ?? 0,
        manual_only: params.manualOnly ?? false,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 4,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseRemixBrainPlanResponse(payload);
  }

  async planArrangementBrain(params: {
    sourceVocalStemArtifactId: string;
    targetInstrumentalStemArtifactId: string;
    arrangementMode: ArrangementStyle;
    sectionStartSec?: number | null;
    sectionDurationSec?: number | null;
  }): Promise<ArrangementBrainPlanResult | null> {
    const response = await this.request("/v1/plan/arrangement-brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_vocal_stem_artifact_id: params.sourceVocalStemArtifactId,
        target_instrumental_stem_artifact_id: params.targetInstrumentalStemArtifactId,
        arrangement_mode: params.arrangementMode,
        section_start_sec: params.sectionStartSec ?? null,
        section_duration_sec: params.sectionDurationSec ?? null,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 4,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseArrangementBrainPlanResponse(payload);
  }

  async createArrangementWavExport(
    params: FullLengthExportRequestParams & { arrangementPlan: Record<string, unknown> }
  ): Promise<FullLengthExportResult | null> {
    const body: Record<string, unknown> = {
      source_vocal_stem_artifact_id: params.sourceVocalStemArtifactId,
      target_instrumental_stem_artifact_id: params.targetInstrumentalStemArtifactId,
      arrangement_plan: params.arrangementPlan,
      tempo_ratio: params.tempoRatio,
      instrumental_tempo_ratio: params.instrumentalTempoRatio,
      pitch_shift_semitones: params.pitchShiftSemitones,
      alignment_offset_ms: params.alignmentOffsetMs,
      export_label: params.exportLabel ?? null,
      loudness_target_mode: params.loudnessTargetMode,
      neutral_processing: params.neutralProcessing,
      confirm_neutral_settings: params.confirmNeutralSettings,
      ...mixSettingsToRequestFields(params.mixSettings),
    };

    const response = await this.request("/v1/export/arrangement-wav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: LOCAL_ENGINE_REQUEST_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseFullWavExportResponse(payload, this.baseUrl);
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
    params: StemPreviewRequestParams,
    options?: { timeoutMs?: number }
  ): Promise<StemPreviewResult | null> {
    const formData = buildStemPreviewFormData(file, params);

    const response = await this.request("/v1/process/stem-preview", {
      method: "POST",
      body: formData,
      timeoutMs: options?.timeoutMs ?? LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS,
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
      body: JSON.stringify(serializeCombinedPreviewRequestBody(params)),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseCombinedPreviewResponse(payload, this.baseUrl);
  }

  async createWavExport(params: ExportWavRequestParams): Promise<ExportWavResult | null> {
    const body: Record<string, unknown> = {
      source_combined_preview_artifact_id: params.sourceCombinedPreviewArtifactId,
      export_format: "wav",
      export_label: params.exportLabel ?? null,
      loudness_target_mode: params.loudnessTargetMode,
    };
    const context = serializeArrangementContextForApi(params.arrangementContext ?? null);
    if (context) {
      body.arrangement_context = context;
    }

    const response = await this.request("/v1/export/wav", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseExportWavResponse(payload, this.baseUrl);
  }

  async createFullWavExport(
    params: FullLengthExportRequestParams
  ): Promise<FullLengthExportResult | null> {
    const body: Record<string, unknown> = {
      source_vocal_stem_artifact_id: params.sourceVocalStemArtifactId,
      target_instrumental_stem_artifact_id: params.targetInstrumentalStemArtifactId,
      mash_intent: params.mashIntent,
      tempo_ratio: params.tempoRatio,
      instrumental_tempo_ratio: params.instrumentalTempoRatio,
      source_bpm: params.sourceBpm,
      target_bpm: params.targetBpm,
      pitch_shift_semitones: params.pitchShiftSemitones,
      alignment_offset_ms: params.alignmentOffsetMs,
      export_label: params.exportLabel ?? null,
      loudness_target_mode: params.loudnessTargetMode,
      neutral_processing: params.neutralProcessing,
      confirm_neutral_settings: params.confirmNeutralSettings,
      ...mixSettingsToRequestFields(params.mixSettings),
    };
    const contextPayload = params.arrangementContext
      ? serializeArrangementContextForApi({
          ...params.arrangementContext,
          exportContextMode: "full_length_context_only",
        })
      : null;
    if (contextPayload) {
      body.arrangement_context = contextPayload;
    }

    const response = await this.request("/v1/export/full-wav", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 12,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseFullWavExportResponse(payload, this.baseUrl);
  }

  async createSectionWavExport(
    params: SectionExportRequestParams
  ): Promise<SectionExportResult | null> {
    const body: Record<string, unknown> = {
      source_vocal_stem_artifact_id: params.sourceVocalStemArtifactId,
      target_instrumental_stem_artifact_id: params.targetInstrumentalStemArtifactId,
      mash_intent: params.mashIntent,
      tempo_ratio: params.tempoRatio,
      instrumental_tempo_ratio: params.instrumentalTempoRatio,
      source_bpm: params.sourceBpm,
      target_bpm: params.targetBpm,
      pitch_shift_semitones: params.pitchShiftSemitones,
      alignment_offset_ms: params.alignmentOffsetMs,
      start_seconds: params.startSeconds,
      duration_seconds: params.durationSeconds,
      start_seconds_unavailable: params.startSecondsUnavailable,
      confirm_advisory_section_export: params.confirmAdvisorySectionExport,
      confirm_start_from_artifact_beginning: params.confirmStartFromArtifactBeginning,
      confirm_stale_context: params.confirmStaleContext,
      binding_freshness_status: params.bindingFreshnessStatus,
      settings_mode: params.settingsMode,
      export_label: params.exportLabel ?? null,
      loudness_target_mode: params.loudnessTargetMode,
      neutral_processing: params.neutralProcessing,
      confirm_neutral_settings: params.confirmNeutralSettings,
      ...mixSettingsToRequestFields(params.mixSettings),
    };
    const contextPayload = serializeArrangementContextForApi(params.arrangementContext);
    if (contextPayload) {
      body.arrangement_context = contextPayload;
    }

    const response = await this.request("/v1/export/section-wav", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 8,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseSectionWavExportResponse(payload, this.baseUrl);
  }

  async createMp3Export(params: Mp3ExportRequestParams): Promise<Mp3ExportResult | null> {
    const response = await this.request("/v1/export/mp3", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_wav_export_artifact_id: params.sourceWavExportArtifactId,
        bitrate_kbps: params.bitrateKbps,
        export_label: params.exportLabel ?? null,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseMp3ExportResponse(payload, this.baseUrl);
  }

  async createMasterWav(params: MasterWavRequestParams): Promise<MasterWavResult | null> {
    const response = await this.request("/v1/master/wav", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_wav_export_artifact_id: params.sourceWavExportArtifactId,
        preset: params.preset,
        export_label: params.exportLabel ?? null,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 8,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parseMasterWavResponse(payload, this.baseUrl);
  }

  async createProjectPackage(
    params: PackageExportRequestParams
  ): Promise<PackageExportResult | null> {
    const response = await this.request("/v1/export/package", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        package_label: params.packageLabel,
        selected_artifact_ids: params.selectedArtifactIds,
        package_type: params.packageType,
        include_technical_report: params.includeTechnicalReport,
      }),
      timeoutMs: LOCAL_ENGINE_ANALYSIS_TIMEOUT_MS * 6,
    });

    if (!response) {
      return null;
    }

    const payload = await response.json();
    return parsePackageExportResponse(payload, this.baseUrl);
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
        signal: createLocalEngineAbortSignal(timeoutMs),
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
