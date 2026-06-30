import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { QuickMixReadinessSummary } from "../../domain/quickMixReadiness.ts";

interface QuickMixReadinessBannerProps {
  readiness: QuickMixReadinessSummary;
}

export function QuickMixReadinessBanner({ readiness }: QuickMixReadinessBannerProps) {
  const Icon = readiness.status === "ready" ? CheckCircle2 : AlertTriangle;

  return (
    <section
      aria-label="Quick Mix readiness"
      className={`quick-mix-readiness quick-mix-readiness-${readiness.status}`}
    >
      <div className="quick-mix-readiness-header">
        <Icon aria-hidden="true" size={18} />
        <strong>{readiness.headline}</strong>
      </div>
      {readiness.status === "setup_needed" ? (
        <ul className="quick-mix-readiness-list">
          {readiness.items
            .filter((item) => !item.ready)
            .map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <span>{item.setupHint}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}
