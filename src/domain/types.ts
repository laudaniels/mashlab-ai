export type SlotId = "trackA" | "trackB";

export type EngineStatus = "implemented" | "engine-pending" | "analysis-coming-next";

export interface AudioInspection {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  waveformPeaks: number[];
  decoded: boolean;
  notes: string[];
}

export interface TrackState {
  slotId: SlotId;
  label: string;
  file: File;
  objectUrl: string;
  inspection: AudioInspection | null;
  status: "loading" | "ready" | "error";
  error: string | null;
}

export interface EngineCapability {
  id: string;
  name: string;
  status: EngineStatus;
  target: string;
  adapterPlan: string;
}

export interface WorkflowScreen {
  id:
    | "intro"
    | "upload"
    | "analysis"
    | "stems"
    | "drafts"
    | "timeline"
    | "export"
    | "rights";
  label: string;
  description: string;
}
