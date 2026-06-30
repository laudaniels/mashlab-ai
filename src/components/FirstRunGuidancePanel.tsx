import { Compass, X } from "lucide-react";
import { useState } from "react";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  dismissFirstRun,
  FIRST_RUN_STEPS,
  isFirstRunDismissed,
  LOCAL_ONLY_PROCESSING_NOTICE,
  SIDECAR_DEPENDENCY_NOTE,
} from "../domain/windowsRuntimeSetup.ts";
import type { WorkflowScreen } from "../domain/types.ts";

type NavigableScreen = WorkflowScreen["id"];

interface FirstRunGuidancePanelProps {
  onNavigate: (screenId: NavigableScreen) => void;
}

export function FirstRunGuidancePanel({ onNavigate }: FirstRunGuidancePanelProps) {
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== "undefined" ? isFirstRunDismissed(sessionStorage) : false
  );

  if (dismissed) {
    return null;
  }

  function handleDismiss() {
    dismissFirstRun(sessionStorage);
    setDismissed(true);
  }

  return (
    <section aria-label="Getting started with MashLab" className="first-run-guidance-panel">
      <div className="first-run-guidance-header">
        <Compass aria-hidden="true" size={18} />
        <div>
          <strong>Getting started</strong>
          <span>Local-only workflow — dismiss anytime</span>
        </div>
        <button
          aria-label="Dismiss getting started panel"
          className="first-run-dismiss"
          onClick={handleDismiss}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      <ol className="first-run-step-list">
        {FIRST_RUN_STEPS.map((step) => (
          <li key={step.id}>
            <div>
              <strong>
                Step {step.stepNumber}: {step.label}
              </strong>
              <p>{step.detail}</p>
            </div>
            <button
              className="secondary-action first-run-step-action"
              onClick={() => onNavigate(step.screenId)}
              type="button"
            >
              Go
            </button>
          </li>
        ))}
      </ol>

      <div className="first-run-notices">
        <p>{LOCAL_ONLY_PROCESSING_NOTICE}</p>
        <p>{requiredRightsNotice}</p>
        <p>{SIDECAR_DEPENDENCY_NOTE}</p>
      </div>
    </section>
  );
}
