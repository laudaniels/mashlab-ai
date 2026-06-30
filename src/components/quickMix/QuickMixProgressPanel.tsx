import { CheckCircle2, Circle, LoaderCircle, XCircle } from "lucide-react";
import type { QuickMixProgressStep } from "../../domain/quickMix.ts";

interface QuickMixProgressPanelProps {
  steps: QuickMixProgressStep[];
  active: boolean;
}

export function QuickMixProgressPanel({ steps, active }: QuickMixProgressPanelProps) {
  if (!active) {
    return null;
  }

  return (
    <section aria-label="Mix progress" className="quick-mix-progress-panel">
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
