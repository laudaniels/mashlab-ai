import { CheckCircle2, Circle, LoaderCircle, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  isQuickMixLongRunningStep,
  quickMixLongRunningHeartbeat,
  quickMixProgressStepHint,
  type QuickMixProgressStep,
  type QuickMixStepId,
} from "../../domain/quickMix.ts";

interface QuickMixProgressPanelProps {
  steps: QuickMixProgressStep[];
  active: boolean;
}

export function QuickMixProgressPanel({ steps, active }: QuickMixProgressPanelProps) {
  const activeStep = steps.find((step) => step.status === "active");
  const activeStepId: QuickMixStepId | null = activeStep ? activeStep.id : null;

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const stepStartRef = useRef<number>(Date.now());
  const trackedStepRef = useRef<QuickMixStepId | null>(null);

  useEffect(() => {
    if (!activeStepId || !isQuickMixLongRunningStep(activeStepId)) {
      trackedStepRef.current = activeStepId;
      setElapsedSeconds(0);
      return;
    }

    if (trackedStepRef.current !== activeStepId) {
      trackedStepRef.current = activeStepId;
      stepStartRef.current = Date.now();
      setElapsedSeconds(0);
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - stepStartRef.current) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeStepId]);

  if (!active) {
    return null;
  }

  const heartbeat =
    activeStepId && isQuickMixLongRunningStep(activeStepId)
      ? quickMixLongRunningHeartbeat(activeStepId, elapsedSeconds)
      : null;
  const activeHint = activeStepId ? quickMixProgressStepHint(activeStepId, "active") : null;

  return (
    <section aria-label="Mix progress" className="quick-mix-progress-panel">
      {heartbeat ? (
        <p aria-live="polite" className="quick-mix-progress-heartbeat">
          {heartbeat}
        </p>
      ) : activeHint ? (
        <p className="quick-mix-progress-hint">{activeHint}</p>
      ) : null}
      <ol className="quick-mix-progress-list">
        {steps.map((step) => (
          <li className={`quick-mix-progress-item quick-mix-progress-${step.status}`} key={step.id}>
            {step.status === "complete" ? (
              <CheckCircle2 aria-hidden="true" size={18} />
            ) : step.status === "failed" ? (
              <XCircle aria-hidden="true" size={18} />
            ) : step.status === "active" ? (
              <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
            ) : (
              <Circle aria-hidden="true" size={18} />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
