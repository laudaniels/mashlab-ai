import type {
  BeatAnalysisResponse,
  KeyAnalysisResponse,
  ServiceCapability,
} from "./types.ts";
import { findCapability } from "./capabilities.ts";

export function isLibrosaAvailable(capabilities: ServiceCapability[]): boolean {
  return findCapability(capabilities, "librosa")?.status === "available";
}

export function parseBeatAnalysisResponse(payload: unknown): BeatAnalysisResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.ok !== "boolean" || typeof record.status !== "string" || typeof record.message !== "string") {
    return null;
  }

  const resultRecord =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : null;

  return {
    ok: record.ok,
    status: record.status,
    message: record.message,
    setup_guidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    result: resultRecord
      ? {
          file_name: String(resultRecord.file_name ?? ""),
          bpm: toNumber(resultRecord.bpm),
          beat_times: toNumberArray(resultRecord.beat_times),
          beat_count: toInteger(resultRecord.beat_count) ?? 0,
          method: String(resultRecord.method ?? "unknown"),
          limitations: toStringArray(resultRecord.limitations),
          confidence: toNumber(resultRecord.confidence),
          downbeat_status:
            resultRecord.downbeat_status === "implemented" ? "implemented" : "not_implemented",
          phrase_marker_status:
            resultRecord.phrase_marker_status === "implemented" ? "implemented" : "not_implemented",
        }
      : null,
  };
}

export function parseKeyAnalysisResponse(payload: unknown): KeyAnalysisResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.ok !== "boolean" || typeof record.status !== "string" || typeof record.message !== "string") {
    return null;
  }

  const resultRecord =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : null;

  return {
    ok: record.ok,
    status: record.status,
    message: record.message,
    setup_guidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    result: resultRecord
      ? {
          file_name: String(resultRecord.file_name ?? ""),
          key: typeof resultRecord.key === "string" ? resultRecord.key : null,
          mode: parseKeyMode(resultRecord.mode),
          camelot: typeof resultRecord.camelot === "string" ? resultRecord.camelot : null,
          method: String(resultRecord.method ?? "unknown"),
          limitations: toStringArray(resultRecord.limitations),
          confidence: toNumber(resultRecord.confidence),
        }
      : null,
  };
}

export function beatResultDetails(result: NonNullable<BeatAnalysisResponse["result"]>): string[] {
  const details = [
    `BPM: ${result.bpm ?? "Unknown"}`,
    `Beat count: ${result.beat_count}`,
    `Method: ${result.method}`,
  ];

  if (result.confidence !== null) {
    details.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  }

  if (result.limitations.length > 0) {
    details.push(`Limitation: ${result.limitations[0]}`);
  }

  details.push("Downbeats/phrases: not implemented in this phase.");
  return details;
}

export function keyResultDetails(result: NonNullable<KeyAnalysisResponse["result"]>): string[] {
  const details = [
    `Key: ${result.key ?? "Unknown"} ${result.mode !== "unknown" ? result.mode : ""}`.trim(),
    `Camelot: ${result.camelot ?? "Unknown"}`,
    `Method: ${result.method}`,
  ];

  if (result.confidence !== null) {
    details.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  }

  if (result.limitations.length > 0) {
    details.push(`Limitation: ${result.limitations[0]}`);
  }

  return details;
}

function parseKeyMode(value: unknown): "major" | "minor" | "unknown" {
  if (value === "major" || value === "minor") {
    return value;
  }

  return "unknown";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function toInteger(value: unknown): number | null {
  const numberValue = toNumber(value);
  return numberValue === null ? null : Math.trunc(numberValue);
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
