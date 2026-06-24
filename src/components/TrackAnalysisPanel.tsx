import { Activity, AlertTriangle, Gauge, KeyRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TrackState } from "../domain/types.ts";
import { useMashAnalysis } from "../hooks/useMashAnalysis.ts";

interface TrackAnalysisPanelProps {
  track: TrackState;
}

export function TrackAnalysisPanel({ track }: TrackAnalysisPanelProps) {
  const { snapshot, isRunning } = useMashAnalysis(track.inspection);

  if (!track.inspection) {
    return (
      <article className="analysis-track-card">
        <h3>{track.file.name}</h3>
        <p className="note-text">Local metadata is still loading.</p>
      </article>
    );
  }

  return (
    <article className="analysis-track-card">
      <div className="analysis-track-header">
        <h3>{track.file.name}</h3>
        <span className="status-text">{isRunning ? "Running adapter hooks" : "Adapter hooks ready"}</span>
      </div>

      <div className="analysis-engine-grid">
        <EngineLane
          icon={Gauge}
          label="Beat / tempo / phrase"
          message={snapshot?.beat.message ?? "Waiting for adapter lane"}
          status={snapshot?.beat.status ?? "analysis-coming-next"}
          state={snapshot?.beat.state ?? "idle"}
        />
        <EngineLane
          icon={KeyRound}
          label="Key / harmony"
          message={snapshot?.key.message ?? "Waiting for adapter lane"}
          status={snapshot?.key.status ?? "analysis-coming-next"}
          state={snapshot?.key.state ?? "idle"}
        />
        <EngineLane
          icon={Activity}
          label="Stem separation"
          message={snapshot?.stems.message ?? "Waiting for adapter lane"}
          status={snapshot?.stems.status ?? "engine-pending"}
          state={snapshot?.stems.state ?? "idle"}
        />
      </div>

      {snapshot?.beat.state === "failed" || snapshot?.key.state === "failed" ? (
        <div className="empty-analysis">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>Decoded audio is required before MIR engines can run on this track.</span>
        </div>
      ) : null}
    </article>
  );
}

interface EngineLaneProps {
  icon: LucideIcon;
  label: string;
  message: string;
  status: "implemented" | "engine-pending" | "analysis-coming-next";
  state: "idle" | "queued" | "running" | "complete" | "failed";
}

function EngineLane({ icon: Icon, label, message, status, state }: EngineLaneProps) {
  return (
    <div className="analysis-engine-lane">
      <div className="analysis-engine-lane-header">
        <Icon aria-hidden="true" size={18} />
        <strong>{label}</strong>
        <span className={`status-pill status-${status}`}>
          {state === "failed" ? "Decode required" : status.replace(/-/g, " ")}
        </span>
      </div>
      <p>{message}</p>
    </div>
  );
}
