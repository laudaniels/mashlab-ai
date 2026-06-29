import { AlertTriangle, Download, LoaderCircle, Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EXPORT_CLUB_VERSION_NOTE,
  EXPORT_GENERAL_LUFS_TARGET,
  EXPORT_GENERAL_TRUE_PEAK_TARGET,
  EXPORT_MP3_STEMS_NOTICE,
  EXPORT_PREP_ACTIVE_NOTICE,
  EXPORT_PREP_LOCKED_NOTICE,
  exportPanelClaimsFinalMaster,
  exportPanelIsLocked,
  exportTargetPlans,
  formatLoudnessTargetSummary,
  isWavExportAvailable,
} from "../domain/exportPrep.ts";
import type { ExportWavResult, LoudnessTargetMode } from "../domain/localExport.ts";
import {
  EXPORT_NOT_MASTERED_NOTICE,
  EXPORT_WAV_ONLY_NOTICE,
  formatExportWarnings,
  normalizePreviewModeLabel,
  validateExportWavRequest,
} from "../domain/localExport.ts";
import type { PreviewArtifactSummary } from "../domain/previewArtifacts.ts";
import { isCombinedPreviewArtifact } from "../domain/previewArtifacts.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { notifyArtifactRefresh, subscribeArtifactRefresh } from "../lib/artifactRefresh.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { loadPreviewArtifactRegistry } from "../lib/previewArtifactRegistry.ts";

interface ExportPrepPanelProps {
  onExportComplete?: () => void;
}

export function ExportPrepPanel({ onExportComplete }: ExportPrepPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const [combinedPreviews, setCombinedPreviews] = useState<PreviewArtifactSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [exportLabel, setExportLabel] = useState("");
  const [loudnessMode, setLoudnessMode] = useState<LoudnessTargetMode>("measurement_only");
  const [busy, setBusy] = useState(false);
  const [exportResult, setExportResult] = useState<ExportWavResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshSources = useCallback(async () => {
    if (!localStatus.online) {
      setCombinedPreviews([]);
      return;
    }

    const registry = loadPreviewArtifactRegistry();
    const listed = await localEngineClient.listArtifacts(registry);
    const combined = listed.filter(isCombinedPreviewArtifact);
    setCombinedPreviews(combined);

    if (combined.length > 0) {
      setSelectedSourceId((current) =>
        current && combined.some((item) => item.artifactId === current)
          ? current
          : combined[combined.length - 1]!.artifactId
      );
    } else {
      setSelectedSourceId("");
    }
  }, [localStatus.online]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => subscribeArtifactRefresh(() => void refreshSources()), [refreshSources]);

  const locked = exportPanelIsLocked(combinedPreviews.length > 0);
  const wavAvailable = isWavExportAvailable(combinedPreviews.length > 0);

  const selectedPreview = useMemo(
    () => combinedPreviews.find((item) => item.artifactId === selectedSourceId) ?? null,
    [combinedPreviews, selectedSourceId]
  );

  async function handleCreateExport() {
    if (!selectedSourceId) {
      setErrorMessage("Select a combined preview artifact first.");
      return;
    }

    const validationErrors = validateExportWavRequest({
      sourceCombinedPreviewArtifactId: selectedSourceId,
      exportLabel: exportLabel.trim() || null,
      loudnessTargetMode: loudnessMode,
    });

    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(" "));
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setExportResult(null);

    const result = await localEngineClient.createWavExport({
      sourceCombinedPreviewArtifactId: selectedSourceId,
      exportLabel: exportLabel.trim() || null,
      loudnessTargetMode: loudnessMode,
    });

    setBusy(false);

    if (!result) {
      setErrorMessage("Local sidecar did not respond to export request.");
      return;
    }

    if (!result.ok) {
      setErrorMessage(
        result.validationErrors?.join(" ") ?? result.message ?? "Export failed."
      );
      return;
    }

    setExportResult(result);
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  return (
    <section className="export-prep-panel" aria-label="Export and mastering preparation">
      <div className="export-prep-header">
        {locked ? <Lock aria-hidden="true" size={20} /> : <Unlock aria-hidden="true" size={20} />}
        <div>
          <h3>Export / Mastering Prep</h3>
          <p>{locked ? EXPORT_PREP_LOCKED_NOTICE : EXPORT_PREP_ACTIVE_NOTICE}</p>
          <p className="export-prep-target-note">{formatLoudnessTargetSummary()}</p>
          <p className="export-prep-club-note">{EXPORT_CLUB_VERSION_NOTE}</p>
          <p className="export-prep-extended-note">{EXPORT_MP3_STEMS_NOTICE}</p>
        </div>
        <span className={`planning-badge ${locked ? "planning-badge-risky" : "planning-badge-ready"}`}>
          {locked ? "Locked" : "WAV export available"}
        </span>
      </div>

      {!locked ? (
        <div className="export-prep-form">
          <label className="export-prep-field">
            <span>Combined preview source</span>
            <select
              disabled={busy || combinedPreviews.length === 0}
              onChange={(event) => setSelectedSourceId(event.target.value)}
              value={selectedSourceId}
            >
              {combinedPreviews.map((item) => (
                <option key={item.artifactId} value={item.artifactId}>
                  {item.registryLabel ?? item.artifactId} ({item.durationSeconds?.toFixed(1) ?? "?"}s)
                </option>
              ))}
            </select>
          </label>

          <label className="export-prep-field">
            <span>Optional export label</span>
            <input
              disabled={busy}
              maxLength={120}
              onChange={(event) => setExportLabel(event.target.value)}
              placeholder="My mashup export"
              type="text"
              value={exportLabel}
            />
          </label>

          <fieldset className="export-prep-loudness-mode">
            <legend>Loudness handling</legend>
            <label>
              <input
                checked={loudnessMode === "measurement_only"}
                disabled={busy}
                name="loudness-mode"
                onChange={() => setLoudnessMode("measurement_only")}
                type="radio"
              />
              {normalizePreviewModeLabel("measurement_only")}
            </label>
            <label>
              <input
                checked={loudnessMode === "normalize_preview"}
                disabled={busy}
                name="loudness-mode"
                onChange={() => setLoudnessMode("normalize_preview")}
                type="radio"
              />
              {normalizePreviewModeLabel("normalize_preview")}
            </label>
          </fieldset>

          <p className="export-prep-not-mastered">{EXPORT_NOT_MASTERED_NOTICE}</p>
          <p className="export-prep-wav-only">{EXPORT_WAV_ONLY_NOTICE}</p>

          {selectedPreview ? (
            <p className="export-prep-source-summary">
              Source: {selectedPreview.registryLabel ?? selectedPreview.artifactId} ·{" "}
              {selectedPreview.sourceTrackLabel ?? "—"} → {selectedPreview.targetTrackLabel ?? "—"}
            </p>
          ) : null}

          <button
            className="export-prep-create-button"
            disabled={!wavAvailable || !localStatus.online || busy || !selectedSourceId}
            onClick={() => void handleCreateExport()}
            type="button"
          >
            {busy ? (
              <>
                <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                Creating local WAV export…
              </>
            ) : (
              <>
                <Download aria-hidden="true" size={16} />
                Create local WAV export
              </>
            )}
          </button>

          {errorMessage ? <p className="export-prep-error">{errorMessage}</p> : null}

          {exportResult?.ok ? (
            <div className="export-prep-result">
              <p>
                Export artifact <strong>{exportResult.exportArtifactId}</strong> created from combined
                preview {exportResult.sourceCombinedPreviewArtifactId}.
              </p>
              <p>
                {exportResult.codec ?? "WAV"} · {exportResult.sampleRate ?? "—"} Hz ·{" "}
                {exportResult.channelCount ?? "—"} ch ·{" "}
                {exportResult.durationSeconds !== null ? `${exportResult.durationSeconds.toFixed(1)}s` : "—"} ·{" "}
                {exportResult.fileSizeBytes !== null
                  ? `${Math.round(exportResult.fileSizeBytes / 1024)} KB`
                  : "—"}
              </p>
              {exportResult.loudness ? (
                <p>
                  Loudness ({exportResult.loudness.status}):{" "}
                  {exportResult.loudness.integratedLufs !== null
                    ? `${exportResult.loudness.integratedLufs.toFixed(1)} LUFS`
                    : "not available"}
                  {" · "}
                  True peak:{" "}
                  {exportResult.loudness.truePeakDbtp !== null
                    ? `${exportResult.loudness.truePeakDbtp.toFixed(1)} dBTP`
                    : "not available"}
                </p>
              ) : null}
              {exportResult.playbackUrl ? (
                <>
                  <audio controls preload="none" src={exportResult.playbackUrl} />
                  <a className="export-prep-download-link" download href={exportResult.playbackUrl}>
                    Download local WAV export
                  </a>
                </>
              ) : null}
              <ul className="export-prep-warnings">
                {formatExportWarnings(exportResult).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="export-prep-final-export">
                finalExport: {String(exportResult.finalExport)} · publicShare:{" "}
                {String(exportResult.publicShare)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="export-prep-grid">
        {exportTargetPlans.map((target) => (
          <article
            className={`export-prep-card ${target.status === "locked" ? "locked" : "available"}`}
            key={target.id}
          >
            <div className="export-prep-card-header">
              <Download aria-hidden="true" size={18} />
              <strong>{target.label}</strong>
            </div>
            <p>{target.description}</p>
            {target.id === "wav" && wavAvailable ? (
              <span className="export-prep-card-status">Available above</span>
            ) : (
              <button className="disabled-action" disabled type="button">
                {target.status === "locked" ? "Not implemented" : "Use export form"}
              </button>
            )}
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
          <dt>Export panel finalExport claim</dt>
          <dd>{String(exportPanelClaimsFinalMaster())}</dd>
        </div>
      </dl>

      <NoticeStrip text={exportResult?.rightsNotice ?? requiredRightsNotice} />
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
