import type { AudioInspection, EngineStatus } from "../domain/types.ts";

export type EngineJobState = "idle" | "queued" | "running" | "complete" | "failed";

export interface EngineJobResult<T> {
  state: EngineJobState;
  data: T | null;
  status: EngineStatus;
  message: string;
  details?: string[];
}

export interface BeatAnalysisResult {
  bpm: number | null;
  bpmConfidence: number | null;
  beatTimes: number[];
  beatCount: number;
  method: string;
  limitations: string[];
  downbeatOffsetMs: number | null;
  phraseBarMarkers: number[];
  downbeatStatus?: "not_implemented" | "implemented";
  phraseMarkerStatus?: "not_implemented" | "implemented";
}

export interface KeyAnalysisResult {
  key: string | null;
  mode: "major" | "minor" | "unknown";
  camelot: string | null;
  confidence: number | null;
  method: string;
  limitations: string[];
  pitchShiftSemitones: number | null;
}

export interface StemSeparationResult {
  stems: Array<{ id: string; label: string; available: boolean }>;
}

export interface PitchTimePlanResult {
  targetBpm: number | null;
  pitchShiftSemitones: number | null;
  qualityNotes: string[];
}

export interface VocalCleanupPlanResult {
  chain: Array<{ id: string; label: string; enabled: boolean }>;
}

export interface ArrangementDraftResult {
  drafts: Array<{ id: string; label: string; available: boolean }>;
}

export interface ExportMasteringResult {
  formats: Array<{ id: string; label: string; available: boolean }>;
  lufsTarget: number | null;
  truePeakCeilingDb: number | null;
}

export interface MashAnalysisSnapshot {
  metadata: EngineJobResult<MetadataAnalysisResult>;
  beat: EngineJobResult<BeatAnalysisResult>;
  key: EngineJobResult<KeyAnalysisResult>;
  stems: EngineJobResult<StemSeparationResult>;
}

export interface MetadataAnalysisResult {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  fileSizeLabel: string;
  durationSeconds: number | null;
  durationLabel: string;
  sampleRate: number | null;
  channelCount: number | null;
  decoded: boolean;
  waveformPeakCount: number;
  notes: string[];
}

export interface AudioEngineAdapter<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly status: EngineStatus;
  analyze(input: TInput): Promise<EngineJobResult<TOutput>>;
}

export type MetadataEngine = AudioEngineAdapter<AudioInspection, MetadataAnalysisResult>;
export type BeatEngine = AudioEngineAdapter<AudioInspection, BeatAnalysisResult>;
export type KeyEngine = AudioEngineAdapter<AudioInspection, KeyAnalysisResult>;
export type StemEngine = AudioEngineAdapter<AudioInspection, StemSeparationResult>;
export type PitchTimeEngine = AudioEngineAdapter<AudioInspection, PitchTimePlanResult>;
export type VocalCleanupEngine = AudioEngineAdapter<AudioInspection, VocalCleanupPlanResult>;
export type ArrangementEngine = AudioEngineAdapter<AudioInspection, ArrangementDraftResult>;
export type ExportMasteringEngine = AudioEngineAdapter<AudioInspection, ExportMasteringResult>;
