import { LoaderCircle, Server, ServerOff } from "lucide-react";
import { findCapability, summarizeCapabilities } from "../lib/localEngine/capabilities.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";

export function LocalEngineStatus() {
  const { status, isChecking } = useLocalEngineStatus();

  const ffprobe = findCapability(status.capabilities, "ffprobe");
  const detail = status.online
    ? summarizeCapabilities(status.capabilities)
    : "Browser-only mode. Local helper service offline.";

  return (
    <section
      aria-label="Local engine service status"
      className={`local-engine-status ${status.online ? "is-online" : "is-offline"}`}
    >
      <div className="local-engine-status-header">
        {isChecking ? (
          <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
        ) : status.online ? (
          <Server aria-hidden="true" size={18} />
        ) : (
          <ServerOff aria-hidden="true" size={18} />
        )}
        <div>
          <strong>{status.online ? "Local service online" : "Browser-only mode"}</strong>
          <span>{detail}</span>
        </div>
      </div>

      {status.online ? (
        <ul className="local-engine-capability-list">
          {status.capabilities.map((capability) => (
            <li key={capability.id}>
              <span>{capability.label}</span>
              <span className={`status-pill status-${capabilityStatusClass(capability.status)}`}>
                {capability.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="local-engine-offline-note">
          Upload and browser metadata still work without the sidecar. Start the Python helper on
          `127.0.0.1:47831` to enable ffprobe-backed metadata when FFmpeg is installed.
        </p>
      )}

      {status.online && ffprobe?.status === "missing" ? (
        <p className="local-engine-offline-note">
          ffprobe is missing. Install FFmpeg to unlock richer local metadata analysis.
        </p>
      ) : null}
    </section>
  );
}

function capabilityStatusClass(status: string): string {
  if (status === "available") {
    return "implemented";
  }

  if (status === "planned") {
    return "engine-pending";
  }

  return "analysis-coming-next";
}
