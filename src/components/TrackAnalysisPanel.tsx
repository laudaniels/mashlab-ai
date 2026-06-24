import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileAudio2,
  Gauge,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TrackState } from "../domain/types.ts";
import type { MashJobStep } from "../domain/jobs.ts";
import { summarizeTrackJob } from "../lib/jobRunner.ts";
import { useTrackJob } from "../hooks/useTrackJob.ts";

interface TrackAnalysisPanelProps {
  sessionId: string;
  track: TrackState;
}

export function TrackAnalysisPanel({ sessionId, track }: TrackAnalysisPanelProps) {
  const { job, isRunning } = useTrackJob({
    sessionId,
    slotId: track.slotId,
    inspection: track.inspection,
  });

  if (!track.inspection) {
    return (
      <article className="analysis-track-card">
        <h3>{track.file.name}</h3>
        <div className="loading-inline">
          <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
          <span>Inspecting local metadata…</span>
        </div>
      </article>
    );
  }

  const summary = job ? summarizeTrackJob(job) : null;

  return (
    <article className="analysis-track-card">
      <div className="analysis-track-header">
        <h3>{track.file.name}</h3>
        <span className="status-text">
          {isRunning
            ? "Running engine job queue"
            : summary
              ? `${summary.completedSteps}/${summary.totalSteps} phases complete`
              : "Job queue pending"}
        </span>
      </div>

      <div className="analysis-engine-grid">
        {(job?.steps ?? []).map((step) => (
          <JobStepLane key={step.id} step={step} />
        ))}
      </div>

      {job?.steps.some((step) => step.id !== "metadata" && step.state === "failed") ? (
        <div className="empty-analysis">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>Decoded audio is required before MIR engines can run on this track.</span>
        </div>
      ) : null}
    </article>
  );
}

function JobStepLane({ step }: { step: MashJobStep }) {
  const Icon = phaseIcon(step.id);

  return (
    <div className="analysis-engine-lane">
      <div className="analysis-engine-lane-header">
        {step.state === "running" ? (
          <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
        ) : step.state === "complete" ? (
          <CheckCircle2 aria-hidden="true" size={18} />
        ) : (
          <Icon aria-hidden="true" size={18} />
        )}
        <strong>{step.label}</strong>
        <span className={`status-pill status-${step.status}`}>{stepStatusLabel(step)}</span>
      </div>
      <p>{step.message}</p>
    </div>
  );
}

function stepStatusLabel(step: MashJobStep): string {
  if (step.state === "running") {
    return "Running";
  }

  if (step.state === "complete" && step.status === "implemented") {
    return "Implemented";
  }

  if (step.state === "failed") {
    return step.id === "metadata" ? "Failed" : "Decode required";
  }

  return step.status.replace(/-/g, " ");
}

function phaseIcon(phase: MashJobStep["id"]): LucideIcon {
  switch (phase) {
    case "metadata":
      return FileAudio2;
    case "beat":
      return Gauge;
    case "key":
      return KeyRound;
    default:
      return Activity;
  }
}
