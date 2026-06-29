import { AlertTriangle, Download, Lock } from "lucide-react";
import {
  EXPORT_CLUB_VERSION_NOTE,
  EXPORT_GENERAL_LUFS_TARGET,
  EXPORT_GENERAL_TRUE_PEAK_TARGET,
  EXPORT_PREP_LOCKED_NOTICE,
  exportPanelClaimsFinalMaster,
  exportPanelIsLocked,
  exportTargetPlans,
  formatLoudnessTargetSummary,
} from "../domain/exportPrep.ts";
import { requiredRightsNotice } from "../lib/legal.ts";

export function ExportPrepPanel() {
  const locked = exportPanelIsLocked();

  return (
    <section className="export-prep-panel" aria-label="Export and mastering preparation">
      <div className="export-prep-header">
        <Lock aria-hidden="true" size={20} />
        <div>
          <h3>Export / Mastering Prep</h3>
          <p>{EXPORT_PREP_LOCKED_NOTICE}</p>
          <p className="export-prep-target-note">{formatLoudnessTargetSummary()}</p>
          <p className="export-prep-club-note">{EXPORT_CLUB_VERSION_NOTE}</p>
        </div>
        <span className="planning-badge planning-badge-risky">Locked</span>
      </div>

      <div className="export-prep-grid">
        {exportTargetPlans.map((target) => (
          <article className="export-prep-card locked" key={target.id}>
            <div className="export-prep-card-header">
              <Download aria-hidden="true" size={18} />
              <strong>{target.label}</strong>
            </div>
            <p>{target.description}</p>
            <button className="disabled-action" disabled type="button">
              {locked ? "Export not implemented" : "Unavailable"}
            </button>
          </article>
        ))}
      </div>

      <dl className="export-prep-targets">
        <div>
          <dt>Future general playback target</dt>
          <dd>
            {EXPORT_GENERAL_LUFS_TARGET} integrated / {EXPORT_GENERAL_TRUE_PEAK_TARGET} true peak
          </dd>
        </div>
        <div>
          <dt>Current preview artifacts</dt>
          <dd>Local preview WAVs only — not final masters</dd>
        </div>
        <div>
          <dt>finalExport flag</dt>
          <dd>{String(exportPanelClaimsFinalMaster())}</dd>
        </div>
      </dl>

      <NoticeStrip text={requiredRightsNotice} />
    </section>
  );
}

function NoticeStrip({ text }: { text: string }) {
  return (
    <div className="export-prep-notice">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>{text}</span>
    </div>
  );
}
