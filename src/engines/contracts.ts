import type { AudioInspection, EngineStatus } from "../domain/types.ts";

export type EngineJobState = "idle" | "queued" | "running" | "complete" | "failed";

export interface EngineJobResult<T> {
  state: EngineJobState;
  data: T | null;
  status: EngineStatus;
  message: string;
}

export interface BeatAnalysisResult {
  bpm: number | null;
  bpmConfidence: number | null;
  downbeatOffsetMs: number | null;
  phraseBarMarkers: number[];
}

export interface KeyAnalysisResult {
  key: string | null;
  camelot: string | null;
  confidence: number | null;
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
  beat: EngineJobResult<BeatAnalysisResult>;
  key: EngineJobResult<KeyAnalysisResult>;
  stems: EngineJobResult<StemSeparationResult>;
}

export interface AudioEngineAdapter<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly status: EngineStatus;
  analyze(input: TInput): Promise<EngineJobResult<TOutput>>;
}

export type BeatEngine = AudioEngineAdapter<AudioInspection, BeatAnalysisResult>;
export type KeyEngine = AudioEngineAdapter<AudioInspection, KeyAnalysisResult>;
export type StemEngine = AudioEngineAdapter<AudioInspection, StemSeparationResult>;
export type PitchTimeEngine = AudioEngineAdapter<AudioInspection, PitchTimePlanResult>;
export type VocalCleanupEngine = AudioEngineAdapter<AudioInspection, VocalCleanupPlanResult>;
export type ArrangementEngine = AudioEngineAdapter<AudioInspection, ArrangementDraftResult>;
export type ExportMasteringEngine = AudioEngineAdapter<AudioInspection, ExportMasteringResult>;
