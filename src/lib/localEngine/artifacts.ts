import type {
  ArtifactMetadataResult,
  ArtifactTechnicalReadout,
  LoudnessReadout,
  PreviewArtifactSummary,
} from "../../domain/previewArtifacts.ts";
import { EXPORT_ARTIFACT_LABEL, PREVIEW_ARTIFACT_LABEL, formatTrackSlotLabel, isPreviewArtifactType } from "../../domain/previewArtifacts.ts";
import type { PreviewArtifactRegistryEntry } from "../../domain/previewArtifacts.ts";
import { findRegistryEntry } from "../previewArtifactRegistry.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export interface ArtifactDeleteResult {
  ok: boolean;
  status: string;
  message: string;
  artifactId: string | null;
  deletedCount: number | null;
}

export function parseArtifactListResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL,
  registry: PreviewArtifactRegistryEntry[] = []
): PreviewArtifactSummary[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.artifacts)) {
    return [];
  }

  return record.artifacts
    .map((item) => parseArtifactSummary(item, baseUrl, registry))
    .filter((item): item is PreviewArtifactSummary => item !== null);
}

export function parseArtifactSummary(
  value: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL,
  registry: PreviewArtifactRegistryEntry[] = []
): PreviewArtifactSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.artifact_id !== "string" || typeof record.artifact_type !== "string") {
    return null;
  }

  if (!isPreviewArtifactType(record.artifact_type)) {
    return null;
  }

  const playbackUrls = parsePlaybackUrls(record.playback_urls, baseUrl);
  const registryEntry = findRegistryEntry(record.artifact_id, registry);

  return {
    artifactId: record.artifact_id,
    artifactType: record.artifact_type,
    status: typeof record.status === "string" ? record.status : "unknown",
    createdAt: typeof record.created_at === "string" ? record.created_at : "",
    durationSeconds: parseNullableNumber(record.duration_seconds),
    playbackUrls,
    playbackUrl: playbackUrls.primary,
    previewOnly: record.preview_only !== false,
    finalExport: record.final_export === true,
    previewLabel:
      typeof record.preview_label === "string"
        ? record.preview_label
        : record.artifact_type === "export"
          ? EXPORT_ARTIFACT_LABEL
          : PREVIEW_ARTIFACT_LABEL,
    primaryFileName:
      typeof record.primary_file_name === "string" ? record.primary_file_name : "preview.wav",
    sourceTrackLabel: formatTrackSlotLabel(registryEntry?.sourceTrackSlot ?? null),
    targetTrackLabel: formatTrackSlotLabel(registryEntry?.targetTrackSlot ?? null),
    registryLabel: registryEntry?.label ?? null,
    sourceCombinedPreviewArtifactId:
      typeof record.source_combined_preview_artifact_id === "string"
        ? record.source_combined_preview_artifact_id
        : null,
    exportSubtype: typeof record.export_subtype === "string" ? record.export_subtype : null,
    exportFormat: typeof record.export_format === "string" ? record.export_format : null,
    sourceVocalStemArtifactId:
      typeof record.source_vocal_stem_artifact_id === "string"
        ? record.source_vocal_stem_artifact_id
        : null,
    targetInstrumentalStemArtifactId:
      typeof record.target_instrumental_stem_artifact_id === "string"
        ? record.target_instrumental_stem_artifact_id
        : null,
    sourceWavExportArtifactId:
      typeof record.source_wav_export_artifact_id === "string"
        ? record.source_wav_export_artifact_id
        : null,
  };
}

export function parseArtifactMetadataResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): ArtifactMetadataResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const artifactType =
    typeof record.artifact_type === "string" && isPreviewArtifactType(record.artifact_type)
      ? record.artifact_type
      : null;
  const playbackUrl = typeof record.playback_url === "string" ? record.playback_url : null;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown metadata response.",
    artifactId: typeof record.artifact_id === "string" ? record.artifact_id : null,
    artifactType,
    previewOnly: record.preview_only !== false,
    finalExport: record.final_export === true,
    playbackUrl,
    playbackPlaybackUrl: playbackUrl ? `${baseUrl}${playbackUrl}` : null,
    technical: parseTechnicalReadout(record.technical),
  };
}

export function parseArtifactDeleteResponse(payload: unknown): ArtifactDeleteResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown delete response.",
    artifactId: typeof record.artifact_id === "string" ? record.artifact_id : null,
    deletedCount: parseNullableNumber(record.deleted_count),
  };
}

export function validateCleanupArtifactId(artifactId: string): string[] {
  const errors: string[] = [];
  if (!/^[a-zA-Z0-9]+$/.test(artifactId)) {
    errors.push("artifact_id must be alphanumeric.");
  }
  return errors;
}

function parsePlaybackUrls(value: unknown, baseUrl: string) {
  if (!value || typeof value !== "object") {
    return { primary: null, vocals: null, noVocals: null };
  }

  const record = value as Record<string, unknown>;
  const primary = typeof record.primary === "string" ? `${baseUrl}${record.primary}` : null;
  const vocals = typeof record.vocals === "string" ? `${baseUrl}${record.vocals}` : null;
  const noVocals = typeof record.no_vocals === "string" ? `${baseUrl}${record.no_vocals}` : null;

  return { primary, vocals, noVocals };
}

function parseTechnicalReadout(value: unknown): ArtifactTechnicalReadout | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    durationSeconds: parseNullableNumber(record.duration_seconds),
    sampleRate: parseNullableNumber(record.sample_rate),
    channelCount: parseNullableNumber(record.channel_count),
    codec: typeof record.codec === "string" ? record.codec : null,
    container: typeof record.container === "string" ? record.container : null,
    fileSizeBytes: parseNullableNumber(record.file_size_bytes),
    loudness: parseLoudnessReadout(record.loudness),
  };
}

function parseLoudnessReadout(value: unknown): LoudnessReadout {
  if (!value || typeof value !== "object") {
    return {
      integratedLufs: null,
      truePeakDbtp: null,
      peakLevelDb: null,
      status: "not_available",
      message: "Loudness readout unavailable.",
    };
  }

  const record = value as Record<string, unknown>;
  return {
    integratedLufs: parseNullableNumber(record.integrated_lufs),
    truePeakDbtp: parseNullableNumber(record.true_peak_dbtp),
    peakLevelDb: parseNullableNumber(record.peak_level_db),
    status: typeof record.status === "string" ? record.status : "not_available",
    message: typeof record.message === "string" ? record.message : "Loudness readout unavailable.",
  };
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}
