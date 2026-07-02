export type Role = "acapella" | "instrumental";

export type TrackStatusValue = "processing" | "done" | "error";

export interface UploadAck {
  id: string;
  role: Role;
  filename: string;
  status: TrackStatusValue;
}

export interface GridFields {
  beats_per_bar: number;
  bpm_confidence: number;
  tempo_stability: number;
  grid_type: string; // "static" | "dynamic"
  first_downbeat_sec: number;
  beat_times: number[];
  downbeat_times: number[];
  grid_source: string; // "beat_this" | "librosa"
  grid_bpm_clean?: number;
  beat_phase_sec?: number;
  bar_phase_sec?: number;
  tempo_constant?: boolean;
  grid_fit_ms?: number;
}

export interface TrackInfo extends GridFields {
  id: string;
  role: Role;
  filename: string;
  status: TrackStatusValue;
  stage?: string;
  error?: string;
  separated?: boolean;
  bpm: number;
  key: string;
  key_index: number;
  mode: string;
  duration: number;
  downbeat_sec: number;
  peaks: number[];
  grid_bpm_clean?: number;
  beat_phase_sec?: number;
  bar_phase_sec?: number;
  tempo_constant?: boolean;
  grid_fit_ms?: number;
}

export interface TrackStatus extends Partial<GridFields> {
  id: string;
  role: Role;
  filename: string;
  status: TrackStatusValue;
  stage?: string;
  error?: string;
  separated?: boolean;
  bpm?: number;
  key?: string;
  key_index?: number;
  mode?: string;
  duration?: number;
  downbeat_sec?: number;
  peaks?: number[];
}

export interface PhraseCandidate {
  bars: number;
  score: number;
}

export interface AlignResult {
  recommended_offset_ms: number;
  offset_confidence: number;
  snapped_to: string; // "beat" | "bar" | "grid"
  tempo_ratio: number;
  semitone_shift: number;
  phrase_candidates: PhraseCandidate[];
}

export type MixPreset = "off" | "light" | "balanced" | "full";

export interface MixReport {
  preset: string;
  vocal_lead_db: number;
  carve_db: number;
  reverb_wet: number;
  input_vocal_rms_db?: number;
  input_instr_rms_db?: number;
  pre_master_lufs?: number;
  out_lufs?: number;
  true_peak_db?: number;
  beat_gain_db?: number;
}

export type ConfidenceTier = "high" | "medium" | "low";

export interface RemixPlanSummary {
  mode: string;
  mode_label: string;
  score: number;
  confidence_tier: ConfidenceTier;
  sync_label: string;
  tempo_label: string;
  key_label: string;
  warnings: string[];
  reason_summary: string;
  score_breakdown: Record<string, number>;
  vocal_anchor_sec: number;
  instrumental_anchor_sec: number;
  vocal_anchor_type: string;
  instrumental_anchor_type: string;
  shift_seconds: number;
}

export interface RemixValidation {
  anchor_offset_ms: number;
  confidence_tier: ConfidenceTier;
  passed: boolean;
  ideal: boolean;
  warnings: string[];
  out_lufs?: number | null;
  true_peak_db?: number | null;
}

export interface RemixPlan {
  mode: string;
  target_bpm: number;
  vocal_start_seconds: number;
  instrumental_start_seconds: number;
  vocal_anchor_sec: number;
  instrumental_anchor_sec: number;
  vocal_anchor_type: string;
  instrumental_anchor_type: string;
  tempo_ratio: number;
  vocal_pitch_shift_semitones: number;
  phrase_alignment: string;
  harmonic_compatibility: string;
  score: number;
  warnings: string[];
  reason_summary: string;
  score_breakdown: Record<string, number>;
  vocal_bpm_effective: number;
  vocal_tempo_mult: number;
  shift_seconds: number;
}

export interface PlanPreviewResponse {
  plan: RemixPlan;
  plan_summary: RemixPlanSummary;
  candidates: RemixPlan[];
  confidence_tier: ConfidenceTier;
}

export interface RemixParams {
  target_bpm: number;
  semitones: number;
  offset_ms: number;
  acapella_gain: number;
  instrumental_gain: number;
  stretch_rate: number;
  downbeat_shift?: number;
  snap?: string;
  acapella_tempo_mult?: number;
  instrumental_tempo_mult?: number;
  placed_downbeat_sec?: number;
  rubberband: boolean;
  beat_lock?: boolean;
  warp_applied?: boolean;
  warp_anchors?: number;
  engine?: string;
  remix_mode?: string;
  mix_preset?: MixPreset;
  mix?: MixReport;
  grid?: GridSyncReport;
  plan?: RemixPlan;
  plan_summary?: RemixPlanSummary;
  candidates?: RemixPlan[];
  validation?: RemixValidation;
  confidence_tier?: ConfidenceTier;
}

export interface GridSyncReport {
  vocal_bpm: number;
  beat_bpm: number;
  vocal_constant: boolean;
  beat_constant: boolean;
  tempo_matched: boolean;
  bar_offset: number;
  placement_score: number;
}

export interface RemixRequestBody {
  acapellaId: string;
  instrumentalId: string;
  targetBpm?: number | null;
  semitones?: number | null;
  offsetMs?: number;
  acapellaGain?: number;
  instrumentalGain?: number;
  downbeatShift?: number;
  snap?: "off" | "beat" | "bar";
  acapellaTempoMult?: number;
  instrumentalTempoMult?: number;
  beatLock?: boolean;
  autoPlacement?: boolean;
  remixMode?: string;
  sectionStartSec?: number | null;
  sectionDurationSec?: number | null;
  mixPreset?: MixPreset;
}

export type JobStatus = "processing" | "done" | "error";

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  params?: RemixParams;
  resultUrl?: string;
  wavUrl?: string;
  error?: string;
}
