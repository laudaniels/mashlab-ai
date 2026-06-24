export type CapabilityStatus = "available" | "missing" | "not_configured" | "planned";

export type LocalServiceJobState = "queued" | "running" | "complete" | "failed" | "cancelled";

export type LocalServiceJobPhase =
  | "metadata"
  | "beat"
  | "key"
  | "stems"
  | "pitch-time"
  | "vocal-cleanup"
  | "arrangement"
  | "export";

export interface LocalEngineHealth {
  ok: boolean;
  service: string;
  version: string;
  bind: string;
  privacy: string;
}

export interface ServiceCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  message: string;
  version?: string | null;
}

export interface LocalEngineCapabilitiesResponse {
  service: string;
  version: string;
  python_version: string;
  capabilities: ServiceCapability[];
}

export interface CreateLocalJobRequest {
  phase: LocalServiceJobPhase;
  session_id: string;
  slot_id: string;
  input?: Record<string, unknown>;
}

export interface LocalServiceJob {
  job_id: string;
  phase: LocalServiceJobPhase;
  state: LocalServiceJobState;
  status: string;
  message: string;
  session_id: string;
  slot_id: string;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FfprobeMetadataResult {
  file_name: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  bitrate: number | null;
  codec: string | null;
  container: string | null;
  sample_rate: number | null;
  channel_count: number | null;
  format_name: string | null;
  source: "ffprobe" | "unavailable";
}

export interface MetadataAnalysisResponse {
  ok: boolean;
  status: string;
  message: string;
  result: FfprobeMetadataResult | null;
  setup_guidance: string | null;
}

export interface LocalEngineConnectionStatus {
  online: boolean;
  mode: "browser-only" | "local-service";
  health: LocalEngineHealth | null;
  capabilities: ServiceCapability[];
  error: string | null;
}

export const DEFAULT_LOCAL_ENGINE_URL = "http://127.0.0.1:47831";

export const LOCAL_ENGINE_REQUEST_TIMEOUT_MS = 2500;
