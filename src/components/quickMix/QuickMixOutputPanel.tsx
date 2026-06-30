import { Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { QuickMixOutputModel } from "../../domain/quickMix.ts";
import { requiredRightsNotice } from "../../lib/legal.ts";

interface QuickMixOutputPanelProps {
  output: QuickMixOutputModel;
  onStartAnother: () => void;
  onOpenAdvancedStudio: () => void;
}

export function QuickMixOutputPanel({
  output,
  onStartAnother,
  onOpenAdvancedStudio,
}: QuickMixOutputPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <section aria-label="Quick Mix result" className="quick-mix-output-panel">
      <div className="quick-mix-output-header">
        <h2>Your mix is ready</h2>
        <p>{output.exportLabel}</p>
        {output.durationCapNotice ? (
          <p className="quick-mix-duration-cap-note">{output.durationCapNotice}</p>
        ) : null}
        <p className="quick-mix-timing-note">{output.timingNotice}</p>
        {output.mp3SkippedReason && !output.mp3DownloadUrl ? (
          <p className="quick-mix-mp3-skipped-note" role="status">
            {output.mp3SkippedReason}
          </p>
        ) : null}
      </div>

      {output.wavPlaybackUrl ? (
        <audio controls preload="metadata" src={output.wavPlaybackUrl}>
          Your browser does not support audio playback.
        </audio>
      ) : null}

      <div className="quick-mix-output-actions">
        {output.wavDownloadUrl ? (
          <a className="primary-action quick-mix-download" href={output.wavDownloadUrl} download>
            <Download aria-hidden="true" size={18} />
            Download WAV
          </a>
        ) : null}
        {output.mp3DownloadUrl ? (
          <a className="secondary-action quick-mix-download" href={output.mp3DownloadUrl} download>
            <Download aria-hidden="true" size={18} />
            Download MP3
          </a>
        ) : null}
        <button className="secondary-action" onClick={onStartAnother} type="button">
          <RefreshCw aria-hidden="true" size={18} />
          Start another mix
        </button>
        <button className="secondary-action" onClick={onOpenAdvancedStudio} type="button">
          <SlidersHorizontal aria-hidden="true" size={18} />
          Open in Advanced Studio
        </button>
      </div>

      <details
        className="quick-mix-technical-details"
        onToggle={(event) => setShowTechnical((event.target as HTMLDetailsElement).open)}
        open={showTechnical}
      >
        <summary>Technical details</summary>
        <ul>
          {output.technicalSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <p className="quick-mix-rights-note">{requiredRightsNotice}</p>
    </section>
  );
}
