import { AlertTriangle, LoaderCircle, Server, ServerOff } from "lucide-react";
import {
  buildDependencyHealth,
  collectMissingSetupGuidance,
  formatDependencyHealthSummary,
  orderedDependencyHealthTiers,
} from "../domain/dependencyHealth.ts";
import {
  dependencyRequirementExplanation,
  formatDependencyTierLabel,
} from "../domain/windowsRuntimeSetup.ts";
import { findCapability } from "../lib/localEngine/capabilities.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { RhythmSelfTestPanel } from "./RhythmSelfTestPanel.tsx";

export function LocalEngineStatus() {
  const { status, isChecking } = useLocalEngineStatus();

  const healthItems = buildDependencyHealth(status.online, status.capabilities);
  const tierGroups = orderedDependencyHealthTiers(healthItems);
  const summary = status.online
    ? formatDependencyHealthSummary(healthItems)
    : "Browser MVP active — sidecar offline.";
  const setupGuidance = collectMissingSetupGuidance(healthItems);

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
          <strong>{status.online ? "Local service online" : "Browser MVP mode"}</strong>
          <span>{summary}</span>
        </div>
      </div>

      {!status.online ? (
        <p className="local-engine-offline-note">
          Upload and planning work without the sidecar. Start the Python helper on 127.0.0.1:47831
          for ffprobe metadata, stem preview, and export. Run <code>npm run start:local</code> for
          steps.
        </p>
      ) : null}

      {tierGroups.map(({ tier, items }) => (
        <div className="local-engine-tier-group" key={tier}>
          <p className="local-engine-tier-label">{formatDependencyTierLabel(tier)}</p>
          <p className="local-engine-tier-hint">{dependencyRequirementExplanation(tier)}</p>
          <ul className="local-engine-capability-list">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <span className={`status-pill status-${dependencyStatusClass(item.status)}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
          <ul className="local-engine-guidance-list">
            {items
              .filter((item) => item.status === "missing" || item.status === "offline")
              .map((item) => (
                <li key={`${item.id}-message`}>{item.message}</li>
              ))}
          </ul>
        </div>
      ))}

      {setupGuidance.length > 0 ? (
        <div className="local-engine-setup-guidance">
          <AlertTriangle aria-hidden="true" size={14} />
          <ul>
            {setupGuidance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {status.online && findCapability(status.capabilities, "rubberband")?.status === "available" ? (
        <p className="local-engine-offline-note">
          Processing lanes are user-initiated only — nothing auto-processes.
        </p>
      ) : null}

      {status.online ? (
        <RhythmSelfTestPanel capabilities={status.capabilities} online={status.online} />
      ) : null}
    </section>
  );
}

function dependencyStatusClass(status: string): string {
  if (status === "online" || status === "available") {
    return "implemented";
  }

  if (status === "planned" || status === "optional") {
    return "engine-pending";
  }

  return "analysis-coming-next";
}
