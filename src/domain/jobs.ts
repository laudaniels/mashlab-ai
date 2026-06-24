import type { EngineStatus, SlotId } from "./types.ts";

export type JobPhase =
  | "metadata"
  | "beat"
  | "key"
  | "stems"
  | "pitch-time"
  | "vocal-cleanup"
  | "arrangement"
  | "export";

export type JobState = "idle" | "queued" | "running" | "complete" | "failed" | "cancelled";

export interface MashJobStep {
  id: JobPhase;
  label: string;
  state: JobState;
  status: EngineStatus;
  message: string;
  details?: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface MashTrackJob {
  jobId: string;
  sessionId: string;
  slotId: SlotId;
  inspectionId: string;
  state: JobState;
  steps: MashJobStep[];
  createdAt: string;
  updatedAt: string;
}

export const JOB_PHASE_ORDER: JobPhase[] = [
  "metadata",
  "beat",
  "key",
  "stems",
  "pitch-time",
  "vocal-cleanup",
  "arrangement",
  "export",
];

export const JOB_PHASE_LABELS: Record<JobPhase, string> = {
  metadata: "Local metadata",
  beat: "Beat / tempo / phrase",
  key: "Key / harmony",
  stems: "Stem separation",
  "pitch-time": "Pitch / time",
  "vocal-cleanup": "Vocal cleanup",
  arrangement: "Arrangement drafts",
  export: "Export / mastering",
};

export function deriveJobState(steps: MashJobStep[]): JobState {
  if (steps.some((step) => step.state === "running")) {
    return "running";
  }

  if (steps.every((step) => step.state === "idle" || step.state === "queued")) {
    return "idle";
  }

  if (steps.some((step) => step.state === "failed")) {
    return "failed";
  }

  if (steps.every((step) => step.state === "complete" || step.state === "idle")) {
    return steps.some((step) => step.state === "complete") ? "complete" : "idle";
  }

  return "running";
}

export function createTrackJob(params: {
  sessionId: string;
  slotId: SlotId;
  inspectionId: string;
}): MashTrackJob {
  const now = new Date().toISOString();

  return {
    jobId: crypto.randomUUID(),
    sessionId: params.sessionId,
    slotId: params.slotId,
    inspectionId: params.inspectionId,
    state: "idle",
    steps: JOB_PHASE_ORDER.map((phase) => ({
      id: phase,
      label: JOB_PHASE_LABELS[phase],
      state: "idle",
      status: phase === "metadata" ? "implemented" : defaultPhaseStatus(phase),
      message: defaultPhaseMessage(phase),
      startedAt: null,
      completedAt: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function defaultPhaseStatus(phase: JobPhase): EngineStatus {
  if (phase === "beat" || phase === "key") {
    return "analysis-coming-next";
  }

  return "engine-pending";
}

function defaultPhaseMessage(phase: JobPhase): string {
  switch (phase) {
    case "metadata":
      return "Waiting for browser metadata inspection.";
    case "beat":
      return "BeatNet+/Essentia adapter lane not connected.";
    case "key":
      return "Key detector adapter lane not connected.";
    case "stems":
      return "Demucs / HTDemucs adapter lane not connected.";
    case "pitch-time":
      return "Rubber Band adapter lane not connected.";
    case "vocal-cleanup":
      return "Vocal cleanup chain not connected.";
    case "arrangement":
      return "Arrangement draft generator not connected.";
    case "export":
      return "Export and mastering lane not connected.";
    default:
      return "Engine pending.";
  }
}
