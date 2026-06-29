import { AlertTriangle, Download, LoaderCircle, Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  buildPitchTimePlanForExport,
  buildFullLengthExportReadiness,
  buildFullLengthExportRequestParams,
  formatReadinessChecklist,
  FULL_LENGTH_EXPORT_NOTICE,
  FULL_LENGTH_PROCESSING_WARNING,
  fullLengthExportModeLabel,
  isFullLengthExportReady,
  resolveFullLengthExportContext,
  validateFullLengthExportRequest,
  type FullLengthExportResult,
  type FullLengthLoudnessMode,
} from "../domain/fullLengthExport.ts";
import {
  EXPORT_CLUB_VERSION_NOTE,
  EXPORT_GENERAL_LUFS_TARGET,
  EXPORT_GENERAL_TRUE_PEAK_TARGET,
  EXPORT_MP3_STEMS_NOTICE,
  EXPORT_PREP_ACTIVE_NOTICE,
  EXPORT_PREP_LOCKED_NOTICE,
  exportPanelClaimsFinalMaster,
  exportPanelHasAnySource,
  exportPanelIsLocked,
  exportTargetPlans,
  formatLoudnessTargetSummary,
  hasFullLengthExportSource,
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
import { rubberBandReadinessFromCapabilityStatus } from "../domain/pitchTimePlanning.ts";
import type { MashIntent } from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import { isCombinedPreviewArtifact } from "../domain/previewArtifacts.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { notifyArtifactRefresh, subscribeArtifactRefresh } from "../lib/artifactRefresh.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  isFfmpegAvailable,
  isRubberBandAvailable,
  rubberBandCapabilitySummary,
} from "../lib/localEngine/capabilities.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { loadPreviewArtifactRegistry } from "../lib/previewArtifactRegistry.ts";

interface ExportPrepPanelProps {
  artifactStore: SessionArtifactStore;
  mashIntent: MashIntent;
  onExportComplete?: () => void;
}

export function ExportPrepPanel({
  artifactStore,
  mashIntent,
  onExportComplete,
}: ExportPrepPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandAvailable = isRubberBandAvailable(localStatus.capabilities);
  const ffmpegAvailable = isFfmpegAvailable(localStatus.capabilities);

  const [combinedPreviews, setCombinedPreviews] = useState<
    import("../domain/previewArtifacts.ts").PreviewArtifactSummary[]
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [fullExportLabel, setFullExportLabel] = useState("");
  const [loudnessMode, setLoudnessMode] = useState<LoudnessTargetMode>("measurement_only");
  const [fullLoudnessMode, setFullLoudnessMode] =
    useState<FullLengthLoudnessMode>("measurement_only");
  const [useNeutralProcessing, setUseNeutralProcessing] = useState(false);
  const [confirmNeutralSettings, setConfirmNeutralSettings] = useState(false);
  const [rightsAcknowledged, setRightsAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);
  const [exportResult, setExportResult] = useState<ExportWavResult | null>(null);
  const [fullExportResult, setFullExportResult] = useState<FullLengthExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullErrorMessage, setFullErrorMessage] = useState<string | null>(null);

  const pitchTimePlan = buildPitchTimePlanForExport(
    artifactStore,
    mashIntent,
    rubberBandReadinessFromCapabilityStatus(rubberBand.status),
    rubberBand.message
  );

  const fullContext = resolveFullLengthExportContext(
    artifactStore,
    mashIntent,
    pitchTimePlan?.directions ?? []
  );

  const readinessItems = buildFullLengthExportReadiness({
    artifactStore,
    context: fullContext,
    sidecarOnline: localStatus.online,
    rubberBandAvailable,
    ffmpegAvailable,
    useNeutralProcessing,
    confirmNeutralSettings,
    rightsAcknowledged,
  });

  const fullLengthReady = isFullLengthExportReady(readinessItems);

  const refreshSources = useCallback(async () => {
    if (!localStatus.online) {
      setCombinedPreviews([]);
      return;
    }

    const registry = loadPreviewArtifactRegistry();
    const listed = await localEngineClient.listArtifacts(registry);
    setCombinedPreviews(listed.filter(isCombinedPreviewArtifact));

    const combined = listed.filter(isCombinedPreviewArtifact);
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

  const hasCombined = combinedPreviews.length > 0;
  const hasStemSource = hasFullLengthExportSource(artifactStore);
  const hasAnySource = exportPanelHasAnySource(hasCombined, hasStemSource);
  const locked = exportPanelIsLocked(hasAnySource);
  const wavAvailable = isWavExportAvailable(hasAnySource);

  async function handleCreatePreviewExport() {
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
      setErrorMessage(result.validationErrors?.join(" ") ?? result.message ?? "Export failed.");
      return;
    }

    setExportResult(result);
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  async function handleCreateFullLengthExport() {
    if (!fullContext) {
      setFullErrorMessage("Full-length export context unavailable.");
      return;
    }

    const params = buildFullLengthExportRequestParams(
      fullContext,
      useNeutralProcessing,
      confirmNeutralSettings,
      fullLoudnessMode,
      fullExportLabel.trim() || null
    );

    const validationErrors = validateFullLengthExportRequest(params);
    if (validationErrors.length > 0) {
      setFullErrorMessage(validationErrors.join(" "));
      return;
    }

    if (!fullLengthReady) {
      setFullErrorMessage("Complete the readiness checklist before full-length export.");
      return;
    }

    setFullBusy(true);
    setFullErrorMessage(null);
    setFullExportResult(null);

    const result = await localEngineClient.createFullWavExport(params);

    setFullBusy(false);

    if (!result) {
      setFullErrorMessage("Local sidecar did not respond to full-length export request.");
      return;
    }

    if (!result.ok) {
      setFullErrorMessage(
        result.validationErrors?.join(" ") ??
          result.setupGuidance ??
          result.message ??
          "Full-length export failed."
      );
      return;
    }

    setFullExportResult(result);
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
        <>
          <div className="export-prep-form export-prep-form-section">
            <h4>Export from combined preview (preview-length copy)</h4>
            {hasCombined ? (
              <>
                <label className="export-prep-field">
                  <span>Combined preview source</span>
                  <select
                    disabled={busy || combinedPreviews.length === 0}
                    onChange={(event) => setSelectedSourceId(event.target.value)}
                    value={selectedSourceId}
                  >
                    {combinedPreviews.map((item) => (
                      <option key={item.artifactId} value={item.artifactId}>
                        {item.registryLabel ?? item.artifactId} (
                        {item.durationSeconds?.toFixed(1) ?? "?"}s)
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
                    placeholder="Preview-length export"
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
                      name="preview-loudness-mode"
                      onChange={() => setLoudnessMode("measurement_only")}
                      type="radio"
                    />
                    {normalizePreviewModeLabel("measurement_only")}
                  </label>
                  <label>
                    <input
                      checked={loudnessMode === "normalize_preview"}
                      disabled={busy}
                      name="preview-loudness-mode"
                      onChange={() => setLoudnessMode("normalize_preview")}
                      type="radio"
                    />
                    {normalizePreviewModeLabel("normalize_preview")}
                  </label>
                </fieldset>
                <p className="export-prep-not-mastered">{EXPORT_NOT_MASTERED_NOTICE}</p>
                <button
                  className="export-prep-create-button"
                  disabled={!wavAvailable || !localStatus.online || busy || !selectedSourceId}
                  onClick={() => void handleCreatePreviewExport()}
                  type="button"
                >
                  {busy ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                      Creating preview-length WAV export…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden="true" size={16} />
                      Create local WAV export (from preview)
                    </>
                  )}
                </button>
                {errorMessage ? <p className="export-prep-error">{errorMessage}</p> : null}
                {exportResult?.ok ? <ExportResultBlock result={exportResult} /> : null}
              </>
            ) : (
              <p className="export-prep-wav-only">No combined preview yet — use full-length export below.</p>
            )}
          </div>

          <div className="export-prep-form export-prep-form-section export-prep-full-length">
            <h4>Full-length render from stem artifacts</h4>
            <p className="export-prep-not-mastered">{FULL_LENGTH_EXPORT_NOTICE}</p>
            <p className="export-prep-wav-only">{FULL_LENGTH_PROCESSING_WARNING}</p>
            <p className="export-prep-wav-only">{EXPORT_WAV_ONLY_NOTICE}</p>

            <ul className="export-prep-readiness-list">
              {formatReadinessChecklist(readinessItems).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <label className="export-prep-neutral-toggle">
              <input
                checked={useNeutralProcessing}
                disabled={fullBusy}
                onChange={(event) => setUseNeutralProcessing(event.target.checked)}
                type="checkbox"
              />
              Use neutral pitch/time (no stretch/shift)
            </label>

            {useNeutralProcessing ? (
              <label className="export-prep-neutral-toggle">
                <input
                  checked={confirmNeutralSettings}
                  disabled={fullBusy}
                  onChange={(event) => setConfirmNeutralSettings(event.target.checked)}
                  type="checkbox"
                />
                I confirm neutral export settings (required when plan data is missing)
              </label>
            ) : null}

            <label className="export-prep-neutral-toggle">
              <input
                checked={rightsAcknowledged}
                disabled={fullBusy}
                onChange={(event) => setRightsAcknowledged(event.target.checked)}
                type="checkbox"
              />
              I acknowledge the rights notice — I supply audio I am authorized to use
            </label>

            <label className="export-prep-field">
              <span>Optional export label</span>
              <input
                disabled={fullBusy}
                maxLength={120}
                onChange={(event) => setFullExportLabel(event.target.value)}
                placeholder="Full-length mashup export"
                type="text"
                value={fullExportLabel}
              />
            </label>

            <fieldset className="export-prep-loudness-mode">
              <legend>Loudness handling</legend>
              <label>
                <input
                  checked={fullLoudnessMode === "measurement_only"}
                  disabled={fullBusy}
                  name="full-loudness-mode"
                  onChange={() => setFullLoudnessMode("measurement_only")}
                  type="radio"
                />
                {fullLengthExportModeLabel("measurement_only")}
              </label>
              <label>
                <input
                  checked={fullLoudnessMode === "normalize_export"}
                  disabled={fullBusy}
                  name="full-loudness-mode"
                  onChange={() => setFullLoudnessMode("normalize_export")}
                  type="radio"
                />
                {fullLengthExportModeLabel("normalize_export")}
              </label>
            </fieldset>

            {fullContext ? (
              <p className="export-prep-source-summary">
                Vocal stem: {fullContext.sourceVocalArtifactId} · Bed stem:{" "}
                {fullContext.targetInstrumentalArtifactId} · Intent: {fullContext.mashIntent}
              </p>
            ) : null}

            <button
              className="export-prep-create-button export-prep-create-button-full"
              disabled={!hasStemSource || !localStatus.online || fullBusy || !fullLengthReady}
              onClick={() => void handleCreateFullLengthExport()}
              type="button"
            >
              {fullBusy ? (
                <>
                  <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                  Rendering full-length local WAV export…
                </>
              ) : (
                <>
                  <Download aria-hidden="true" size={16} />
                  Create full-length local WAV export
                </>
              )}
            </button>

            {fullErrorMessage ? <p className="export-prep-error">{fullErrorMessage}</p> : null}

            {fullExportResult?.ok ? (
              <FullExportResultBlock result={fullExportResult} />
            ) : null}
          </div>
        </>
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

      <NoticeStrip
        text={
          fullExportResult?.rightsNotice ??
          exportResult?.rightsNotice ??
          requiredRightsNotice
        }
      />
    </section>
  );
}

function ExportResultBlock({ result }: { result: ExportWavResult }) {
  return (
    <div className="export-prep-result">
      <p>
        Export artifact <strong>{result.exportArtifactId}</strong> from combined preview{" "}
        {result.sourceCombinedPreviewArtifactId}.
      </p>
      <TechnicalSummary
        codec={result.codec}
        sampleRate={result.sampleRate}
        channelCount={result.channelCount}
        durationSeconds={result.durationSeconds}
        fileSizeBytes={result.fileSizeBytes}
        loudness={result.loudness}
      />
      {result.playbackUrl ? (
        <>
          <audio controls preload="none" src={result.playbackUrl} />
          <a className="export-prep-download-link" download href={result.playbackUrl}>
            Download local WAV export
          </a>
        </>
      ) : null}
      <ul className="export-prep-warnings">
        {formatExportWarnings(result).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function FullExportResultBlock({ result }: { result: FullLengthExportResult }) {
  return (
    <div className="export-prep-result export-prep-result-full">
      <p>
        Full-length export <strong>{result.exportArtifactId}</strong> rendered from stem artifacts.
      </p>
      <TechnicalSummary
        codec={result.codec}
        sampleRate={result.sampleRate}
        channelCount={result.channelCount}
        durationSeconds={result.durationSeconds}
        fileSizeBytes={result.fileSizeBytes}
        loudness={result.loudness}
      />
      {result.loudnessGate ? (
        <p className={`export-prep-loudness-gate export-prep-loudness-gate-${result.loudnessGate.status}`}>
          Loudness gate ({result.loudnessGate.status}): {result.loudnessGate.message}
        </p>
      ) : null}
      {result.playbackUrl ? (
        <>
          <audio controls preload="none" src={result.playbackUrl} />
          <a className="export-prep-download-link" download href={result.playbackUrl}>
            Download full-length local WAV export
          </a>
        </>
      ) : null}
      <ul className="export-prep-warnings">
        {[...result.warnings, ...result.limitations].map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="export-prep-final-export">
        finalExport: {String(result.finalExport)} · publicShare: {String(result.publicShare)}
      </p>
    </div>
  );
}

function TechnicalSummary({
  codec,
  sampleRate,
  channelCount,
  durationSeconds,
  fileSizeBytes,
  loudness,
}: {
  codec: string | null;
  sampleRate: number | null;
  channelCount: number | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  loudness: ExportWavResult["loudness"];
}) {
  return (
    <>
      <p>
        {codec ?? "WAV"} · {sampleRate ?? "—"} Hz · {channelCount ?? "—"} ch ·{" "}
        {durationSeconds !== null ? `${durationSeconds.toFixed(1)}s` : "—"} ·{" "}
        {fileSizeBytes !== null ? `${Math.round(fileSizeBytes / 1024)} KB` : "—"}
      </p>
      {loudness ? (
        <p>
          Loudness ({loudness.status}):{" "}
          {loudness.integratedLufs !== null
            ? `${loudness.integratedLufs.toFixed(1)} LUFS`
            : "not available"}
          {" · "}
          True peak:{" "}
          {loudness.truePeakDbtp !== null
            ? `${loudness.truePeakDbtp.toFixed(1)} dBTP`
            : "not available"}
        </p>
      ) : null}
    </>
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
