import type { Mp3BitrateKbps } from "../domain/mp3Export.ts";
import { DEFAULT_MP3_BITRATE, parseMp3Bitrate } from "../domain/mp3Export.ts";
import type { LoudnessTargetMode } from "../domain/localExport.ts";
import type { FullLengthLoudnessMode } from "../domain/fullLengthExport.ts";

const STORAGE_KEY = "mashlab-export-session-v1";

export type ExportMode = "preview-wav" | "full-wav" | "mp3-reference";

export interface LastSuccessfulExport {
  mode: ExportMode;
  exportArtifactId: string;
  sourceArtifactId: string | null;
  exportFormat: "wav" | "mp3";
  bitrateKbps: number | null;
  createdAt: string;
}

export interface ExportSessionPreferences {
  lastExportMode: ExportMode;
  lastMp3Bitrate: Mp3BitrateKbps;
  lastPreviewLoudnessMode: LoudnessTargetMode;
  lastFullLoudnessMode: FullLengthLoudnessMode;
  lastSuccessfulExport: LastSuccessfulExport | null;
}

const DEFAULT_PREFERENCES: ExportSessionPreferences = {
  lastExportMode: "preview-wav",
  lastMp3Bitrate: DEFAULT_MP3_BITRATE,
  lastPreviewLoudnessMode: "measurement_only",
  lastFullLoudnessMode: "measurement_only",
  lastSuccessfulExport: null,
};

export function loadExportSessionPreferences(): ExportSessionPreferences {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }

    const parsed = JSON.parse(raw) as Partial<ExportSessionPreferences>;
    return {
      lastExportMode: parseExportMode(parsed.lastExportMode),
      lastMp3Bitrate: parseMp3Bitrate(parsed.lastMp3Bitrate),
      lastPreviewLoudnessMode: parsePreviewLoudnessMode(parsed.lastPreviewLoudnessMode),
      lastFullLoudnessMode: parseFullLoudnessMode(parsed.lastFullLoudnessMode),
      lastSuccessfulExport: parseLastSuccessfulExport(parsed.lastSuccessfulExport),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveExportSessionPreferences(preferences: ExportSessionPreferences): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore quota or privacy mode failures.
  }
}

export function updateExportSessionPreferences(
  patch: Partial<ExportSessionPreferences>
): ExportSessionPreferences {
  const current = loadExportSessionPreferences();
  const next = { ...current, ...patch };
  saveExportSessionPreferences(next);
  return next;
}

export function recordSuccessfulExport(entry: LastSuccessfulExport): ExportSessionPreferences {
  return updateExportSessionPreferences({
    lastExportMode: entry.mode,
    lastSuccessfulExport: entry,
    ...(entry.bitrateKbps !== null ? { lastMp3Bitrate: parseMp3Bitrate(entry.bitrateKbps) } : {}),
  });
}

export function canReExportWithCurrentSettings(
  preferences: ExportSessionPreferences,
  wavExportArtifactIds: readonly string[],
  combinedPreviewArtifactIds: readonly string[],
  hasStemSource: boolean
): boolean {
  const last = preferences.lastSuccessfulExport;
  if (!last) {
    return false;
  }

  switch (last.mode) {
    case "mp3-reference":
      return Boolean(last.sourceArtifactId) && wavExportArtifactIds.includes(last.sourceArtifactId!);
    case "preview-wav":
      return Boolean(last.sourceArtifactId) && combinedPreviewArtifactIds.includes(last.sourceArtifactId!);
    case "full-wav":
      return hasStemSource;
    default:
      return false;
  }
}

function parseExportMode(value: unknown): ExportMode {
  if (value === "full-wav" || value === "mp3-reference" || value === "preview-wav") {
    return value;
  }
  return DEFAULT_PREFERENCES.lastExportMode;
}

function parsePreviewLoudnessMode(value: unknown): LoudnessTargetMode {
  return value === "normalize_preview" ? "normalize_preview" : "measurement_only";
}

function parseFullLoudnessMode(value: unknown): FullLengthLoudnessMode {
  return value === "normalize_export" ? "normalize_export" : "measurement_only";
}

function parseLastSuccessfulExport(value: unknown): LastSuccessfulExport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.exportArtifactId !== "string" || typeof record.mode !== "string") {
    return null;
  }

  const mode = parseExportMode(record.mode);
  const exportFormat = record.exportFormat === "mp3" ? "mp3" : "wav";

  return {
    mode,
    exportArtifactId: record.exportArtifactId,
    sourceArtifactId:
      typeof record.sourceArtifactId === "string" ? record.sourceArtifactId : null,
    exportFormat,
    bitrateKbps:
      typeof record.bitrateKbps === "number" && Number.isFinite(record.bitrateKbps)
        ? record.bitrateKbps
        : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}
