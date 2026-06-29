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
  isMasteringAvailable,
  isMp3ExportAvailable,
  isProjectPackageAvailable,
  isWavExportAvailable,
} from "../domain/exportPrep.ts";
import {
  DEFAULT_MASTERING_PRESET,
  formatGateStatus,
  formatMasteringPresetName,
  formatMasteringWarnings,
  formatReadoutLoudnessLine,
  formatTargetLoudnessSummary,
  getMasteringPresetDefinition,
  MASTERING_DJ_REVIEW_NOTICE,
  MASTERING_NO_RIGHTS_NOTICE,
  MASTERING_PRESET_DEFINITIONS,
  MASTERING_PROTOTYPE_NOTICE,
  masteringPanelIsLocked,
  validateMasterWavRequest,
  type MasteringPresetId,
  type MasterWavResult,
} from "../domain/masteringPresets.ts";
import type { ExportWavResult, LoudnessTargetMode } from "../domain/localExport.ts";
import {
  EXPORT_NOT_MASTERED_NOTICE,
  EXPORT_WAV_ONLY_NOTICE,
  formatExportWarnings,
  normalizePreviewModeLabel,
  validateExportWavRequest,
} from "../domain/localExport.ts";
import {
  ALLOWED_MP3_BITRATES,
  formatMp3Bitrate,
  formatMp3ExportWarnings,
  isWavExportArtifact,
  MP3_NOT_MASTERED_NOTICE,
  MP3_REFERENCE_NOTICE,
  mp3ExportPanelIsLocked,
  validateMp3ExportRequest,
  type Mp3BitrateKbps,
  type Mp3ExportResult,
} from "../domain/mp3Export.ts";
import {
  ALLOWED_PACKAGE_TYPES,
  DEFAULT_PACKAGE_TYPE,
  formatPackageableArtifactOption,
  formatPackageManifestSummary,
  formatPackageWarnings,
  isPackageableArtifact,
  PACKAGE_EXPORT_NOTICE,
  PACKAGE_MANIFEST_ALWAYS_INCLUDED,
  PACKAGE_RAW_UPLOADS_EXCLUDED_NOTICE,
  selectDefaultPackageArtifacts,
  validatePackageExportRequest,
  validateSelectedArtifactIds,
  type PackageExportResult,
  type PackageType,
} from "../domain/projectPackage.ts";
import { rubberBandReadinessFromCapabilityStatus } from "../domain/pitchTimePlanning.ts";
import type { MashIntent } from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import { isCombinedPreviewArtifact } from "../domain/previewArtifacts.ts";
import type { MixSettings } from "../domain/mixControls.ts";
import { loadMixSettings } from "../lib/mixSession.ts";
import { MixControlsPanel } from "./MixControlsPanel.tsx";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { notifyArtifactRefresh, subscribeArtifactRefresh } from "../lib/artifactRefresh.ts";
import {
  canReExportWithCurrentSettings,
  loadExportSessionPreferences,
  recordSuccessfulExport,
  updateExportSessionPreferences,
  type ExportSessionPreferences,
} from "../lib/exportSession.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  isFfmpegAvailable,
  isRubberBandAvailable,
  rubberBandCapabilitySummary,
} from "../lib/localEngine/capabilities.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { loadPreviewArtifactRegistry } from "../lib/previewArtifactRegistry.ts";
import { loadAppliedDraftSettings } from "../lib/arrangementDraftSession.ts";

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
  const [wavExports, setWavExports] = useState<
    import("../domain/previewArtifacts.ts").PreviewArtifactSummary[]
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedWavExportId, setSelectedWavExportId] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [fullExportLabel, setFullExportLabel] = useState("");
  const [mp3ExportLabel, setMp3ExportLabel] = useState("");
  const [masteringPreset, setMasteringPreset] =
    useState<MasteringPresetId>(DEFAULT_MASTERING_PRESET);
  const [masterExportLabel, setMasterExportLabel] = useState("");
  const [mp3Bitrate, setMp3Bitrate] = useState<Mp3BitrateKbps>(320);
  const [sessionPrefs, setSessionPrefs] = useState<ExportSessionPreferences>(() =>
    loadExportSessionPreferences()
  );
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
  const [mp3ExportResult, setMp3ExportResult] = useState<Mp3ExportResult | null>(null);
  const [masterResult, setMasterResult] = useState<MasterWavResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullErrorMessage, setFullErrorMessage] = useState<string | null>(null);
  const [mp3ErrorMessage, setMp3ErrorMessage] = useState<string | null>(null);
  const [masterErrorMessage, setMasterErrorMessage] = useState<string | null>(null);
  const [mp3Busy, setMp3Busy] = useState(false);
  const [masterBusy, setMasterBusy] = useState(false);
  const [reExportBusy, setReExportBusy] = useState(false);
  const [mixSettings, setMixSettings] = useState<MixSettings>(() => loadMixSettings());
  const [packageableArtifacts, setPackageableArtifacts] = useState<
    import("../domain/previewArtifacts.ts").PreviewArtifactSummary[]
  >([]);
  const [selectedPackageArtifactIds, setSelectedPackageArtifactIds] = useState<string[]>([]);
  const [packageLabel, setPackageLabel] = useState("");
  const [packageType, setPackageType] = useState<PackageType>(DEFAULT_PACKAGE_TYPE);
  const [includeTechnicalReport, setIncludeTechnicalReport] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageResult, setPackageResult] = useState<PackageExportResult | null>(null);
  const [packageErrorMessage, setPackageErrorMessage] = useState<string | null>(null);
  const [appliedDraftExportNotice, setAppliedDraftExportNotice] = useState<string | null>(null);

  useEffect(() => {
    const applied = loadAppliedDraftSettings();
    if (!applied) {
      return;
    }

    if (applied.exportMode === "full_length") {
      setAppliedDraftExportNotice(
        `Arrangement draft "${applied.draftType.replace(/_/g, " ")}" suggests full-length export — use Full-length WAV when ready (no auto-export).`
      );
      return;
    }

    if (applied.exportMode === "preview_copy") {
      setAppliedDraftExportNotice(
        `Arrangement draft "${applied.draftType.replace(/_/g, " ")}" suggests preview-length export — create combined preview first, then export when ready.`
      );
    }
  }, []);

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
    const wavOnly = listed.filter(isWavExportArtifact);
    setWavExports(wavOnly);
    const packageable = listed.filter(isPackageableArtifact);
    setPackageableArtifacts(packageable);
    setSelectedPackageArtifactIds((current) => {
      if (current.length > 0 && current.every((id) => packageable.some((item) => item.artifactId === id))) {
        return current;
      }
      return selectDefaultPackageArtifacts(listed);
    });

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

    if (wavOnly.length > 0) {
      setSelectedWavExportId((current) =>
        current && wavOnly.some((item) => item.artifactId === current)
          ? current
          : wavOnly[wavOnly.length - 1]!.artifactId
      );
    } else {
      setSelectedWavExportId("");
    }
  }, [localStatus.online]);

  useEffect(() => {
    const prefs = loadExportSessionPreferences();
    setSessionPrefs(prefs);
    setLoudnessMode(prefs.lastPreviewLoudnessMode);
    setFullLoudnessMode(prefs.lastFullLoudnessMode);
    setMp3Bitrate(prefs.lastMp3Bitrate);
  }, []);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => subscribeArtifactRefresh(() => void refreshSources()), [refreshSources]);

  const hasCombined = combinedPreviews.length > 0;
  const hasStemSource = hasFullLengthExportSource(artifactStore);
  const hasAnySource = exportPanelHasAnySource(hasCombined, hasStemSource);
  const locked = exportPanelIsLocked(hasAnySource);
  const wavAvailable = isWavExportAvailable(hasAnySource);
  const mp3Available = isMp3ExportAvailable(wavExports.length);
  const mp3Locked = mp3ExportPanelIsLocked(wavExports);
  const masteringLocked = masteringPanelIsLocked(wavExports);
  const masteringAvailable = isMasteringAvailable(wavExports.length);
  const packageAvailable = isProjectPackageAvailable(packageableArtifacts.length);
  const selectedPresetDef = getMasteringPresetDefinition(masteringPreset);
  const canReExport = canReExportWithCurrentSettings(
    sessionPrefs,
    wavExports.length > 0,
    hasCombined,
    hasStemSource
  );

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
    updateExportSessionPreferences({
      lastExportMode: "preview-wav",
      lastPreviewLoudnessMode: loudnessMode,
    });
    if (result.exportArtifactId) {
      setSessionPrefs(
        recordSuccessfulExport({
          mode: "preview-wav",
          exportArtifactId: result.exportArtifactId,
          sourceArtifactId: selectedSourceId,
          exportFormat: "wav",
          bitrateKbps: null,
          createdAt: new Date().toISOString(),
        })
      );
    }
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  async function handleCreateMp3Export() {
    if (!selectedWavExportId) {
      setMp3ErrorMessage("Select a WAV export artifact first.");
      return;
    }

    const validationErrors = validateMp3ExportRequest({
      sourceWavExportArtifactId: selectedWavExportId,
      bitrateKbps: mp3Bitrate,
      exportLabel: mp3ExportLabel.trim() || null,
    });

    if (validationErrors.length > 0) {
      setMp3ErrorMessage(validationErrors.join(" "));
      return;
    }

    setMp3Busy(true);
    setMp3ErrorMessage(null);
    setMp3ExportResult(null);

    const result = await localEngineClient.createMp3Export({
      sourceWavExportArtifactId: selectedWavExportId,
      bitrateKbps: mp3Bitrate,
      exportLabel: mp3ExportLabel.trim() || null,
    });

    setMp3Busy(false);

    if (!result) {
      setMp3ErrorMessage("Local sidecar did not respond to MP3 export request.");
      return;
    }

    if (!result.ok) {
      setMp3ErrorMessage(
        result.validationErrors?.join(" ") ??
          result.setupGuidance ??
          result.message ??
          "MP3 export failed."
      );
      return;
    }

    setMp3ExportResult(result);
    updateExportSessionPreferences({
      lastExportMode: "mp3-reference",
      lastMp3Bitrate: mp3Bitrate,
    });
    if (result.exportArtifactId) {
      setSessionPrefs(
        recordSuccessfulExport({
          mode: "mp3-reference",
          exportArtifactId: result.exportArtifactId,
          sourceArtifactId: selectedWavExportId,
          exportFormat: "mp3",
          bitrateKbps: mp3Bitrate,
          createdAt: new Date().toISOString(),
        })
      );
    }
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  async function handleRunMasteringPreset() {
    if (!selectedWavExportId) {
      setMasterErrorMessage("Select a WAV export artifact first.");
      return;
    }

    const validationErrors = validateMasterWavRequest({
      sourceWavExportArtifactId: selectedWavExportId,
      preset: masteringPreset,
      exportLabel: masterExportLabel.trim() || null,
    });

    if (validationErrors.length > 0) {
      setMasterErrorMessage(validationErrors.join(" "));
      return;
    }

    setMasterBusy(true);
    setMasterErrorMessage(null);
    setMasterResult(null);

    const result = await localEngineClient.createMasterWav({
      sourceWavExportArtifactId: selectedWavExportId,
      preset: masteringPreset,
      exportLabel: masterExportLabel.trim() || null,
    });

    setMasterBusy(false);

    if (!result) {
      setMasterErrorMessage("Local sidecar did not respond to mastering request.");
      return;
    }

    if (!result.ok) {
      setMasterErrorMessage(
        result.validationErrors?.join(" ") ??
          result.setupGuidance ??
          result.message ??
          "Mastering preset failed."
      );
      return;
    }

    setMasterResult(result);
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  function togglePackageArtifact(artifactId: string) {
    setSelectedPackageArtifactIds((current) =>
      current.includes(artifactId)
        ? current.filter((id) => id !== artifactId)
        : [...current, artifactId]
    );
  }

  async function handleCreateProjectPackage() {
    const label = packageLabel.trim() || "MashLab Project";

    const requestErrors = [
      ...validatePackageExportRequest({
        packageLabel: label,
        selectedArtifactIds: selectedPackageArtifactIds,
        packageType,
        includeTechnicalReport,
      }),
      ...validateSelectedArtifactIds(selectedPackageArtifactIds, packageableArtifacts),
    ];

    if (requestErrors.length > 0) {
      setPackageErrorMessage(requestErrors.join(" "));
      return;
    }

    setPackageBusy(true);
    setPackageErrorMessage(null);
    setPackageResult(null);

    const result = await localEngineClient.createProjectPackage({
      packageLabel: label,
      selectedArtifactIds: selectedPackageArtifactIds,
      packageType,
      includeTechnicalReport,
    });

    setPackageBusy(false);

    if (!result) {
      setPackageErrorMessage("Local sidecar did not respond to package export request.");
      return;
    }

    if (!result.ok) {
      setPackageErrorMessage(
        result.validationErrors?.join(" ") ??
          result.setupGuidance ??
          result.message ??
          "Project package export failed."
      );
      return;
    }

    setPackageResult(result);
    notifyArtifactRefresh();
    onExportComplete?.();
  }

  async function handleReExportWithCurrentSettings() {
    const last = sessionPrefs.lastSuccessfulExport;
    if (!last || !canReExport) {
      return;
    }

    setReExportBusy(true);

    if (last.mode === "preview-wav" && last.sourceArtifactId) {
      setSelectedSourceId(last.sourceArtifactId);
      setLoudnessMode(sessionPrefs.lastPreviewLoudnessMode);
      setExportResult(null);
      setErrorMessage(null);
      setBusy(true);

      const result = await localEngineClient.createWavExport({
        sourceCombinedPreviewArtifactId: last.sourceArtifactId,
        exportLabel: exportLabel.trim() || null,
        loudnessTargetMode: sessionPrefs.lastPreviewLoudnessMode,
      });

      setBusy(false);
      setReExportBusy(false);

      if (result?.ok) {
        setExportResult(result);
        if (result.exportArtifactId) {
          setSessionPrefs(
            recordSuccessfulExport({
              mode: "preview-wav",
              exportArtifactId: result.exportArtifactId,
              sourceArtifactId: last.sourceArtifactId,
              exportFormat: "wav",
              bitrateKbps: null,
              createdAt: new Date().toISOString(),
            })
          );
        }
        notifyArtifactRefresh();
        onExportComplete?.();
      } else {
        setErrorMessage(result?.message ?? "Re-export failed.");
      }
      return;
    }

    if (last.mode === "mp3-reference" && last.sourceArtifactId) {
      setSelectedWavExportId(last.sourceArtifactId);
      setMp3Bitrate(sessionPrefs.lastMp3Bitrate);
      setMp3ExportResult(null);
      setMp3ErrorMessage(null);
      setMp3Busy(true);

      const result = await localEngineClient.createMp3Export({
        sourceWavExportArtifactId: last.sourceArtifactId,
        bitrateKbps: sessionPrefs.lastMp3Bitrate,
        exportLabel: mp3ExportLabel.trim() || null,
      });

      setMp3Busy(false);
      setReExportBusy(false);

      if (result?.ok) {
        setMp3ExportResult(result);
        if (result.exportArtifactId) {
          setSessionPrefs(
            recordSuccessfulExport({
              mode: "mp3-reference",
              exportArtifactId: result.exportArtifactId,
              sourceArtifactId: last.sourceArtifactId,
              exportFormat: "mp3",
              bitrateKbps: sessionPrefs.lastMp3Bitrate,
              createdAt: new Date().toISOString(),
            })
          );
        }
        notifyArtifactRefresh();
        onExportComplete?.();
      } else {
        setMp3ErrorMessage(result?.message ?? "Re-export failed.");
      }
      return;
    }

    setReExportBusy(false);
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
      mixSettings,
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
    updateExportSessionPreferences({
      lastExportMode: "full-wav",
      lastFullLoudnessMode: fullLoudnessMode,
    });
    if (result.exportArtifactId) {
      setSessionPrefs(
        recordSuccessfulExport({
          mode: "full-wav",
          exportArtifactId: result.exportArtifactId,
          sourceArtifactId: fullContext?.sourceVocalArtifactId ?? null,
          exportFormat: "wav",
          bitrateKbps: null,
          createdAt: new Date().toISOString(),
        })
      );
    }
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
          <p className="export-prep-rights-note">{requiredRightsNotice}</p>
          {appliedDraftExportNotice ? (
            <p className="arrangement-plan-applied-note">{appliedDraftExportNotice}</p>
          ) : null}
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
                      onChange={() => {
                        setLoudnessMode("measurement_only");
                        updateExportSessionPreferences({ lastPreviewLoudnessMode: "measurement_only" });
                      }}
                      type="radio"
                    />
                    {normalizePreviewModeLabel("measurement_only")}
                  </label>
                  <label>
                    <input
                      checked={loudnessMode === "normalize_preview"}
                      disabled={busy}
                      name="preview-loudness-mode"
                      onChange={() => {
                        setLoudnessMode("normalize_preview");
                        updateExportSessionPreferences({ lastPreviewLoudnessMode: "normalize_preview" });
                      }}
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

          <MixControlsPanel
            disabled={fullBusy || busy || mp3Busy || masterBusy || packageBusy}
            onChange={setMixSettings}
            settings={mixSettings}
          />

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
                  onChange={() => {
                    setFullLoudnessMode("measurement_only");
                    updateExportSessionPreferences({ lastFullLoudnessMode: "measurement_only" });
                  }}
                  type="radio"
                />
                {fullLengthExportModeLabel("measurement_only")}
              </label>
              <label>
                <input
                  checked={fullLoudnessMode === "normalize_export"}
                  disabled={fullBusy}
                  name="full-loudness-mode"
                  onChange={() => {
                    setFullLoudnessMode("normalize_export");
                    updateExportSessionPreferences({ lastFullLoudnessMode: "normalize_export" });
                  }}
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

          <div className="export-prep-form export-prep-form-section export-prep-mp3">
            <h4>MP3 reference export (from WAV export)</h4>
            <p className="export-prep-wav-only">{EXPORT_WAV_ONLY_NOTICE}</p>
            <p className="export-prep-not-mastered">{MP3_REFERENCE_NOTICE}</p>
            <p className="export-prep-not-mastered">{MP3_NOT_MASTERED_NOTICE}</p>

            {mp3Locked ? (
              <p className="export-prep-wav-only">
                Create a local WAV export first to unlock MP3 reference export.
              </p>
            ) : (
              <>
                <label className="export-prep-field">
                  <span>WAV export source</span>
                  <select
                    disabled={mp3Busy || wavExports.length === 0}
                    onChange={(event) => setSelectedWavExportId(event.target.value)}
                    value={selectedWavExportId}
                  >
                    {wavExports.map((item) => (
                      <option key={item.artifactId} value={item.artifactId}>
                        {item.exportSubtype ?? "wav"} — {item.artifactId} (
                        {item.durationSeconds?.toFixed(1) ?? "?"}s)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="export-prep-field">
                  <span>MP3 bitrate</span>
                  <select
                    disabled={mp3Busy}
                    onChange={(event) => {
                      const next = Number(event.target.value) as Mp3BitrateKbps;
                      setMp3Bitrate(next);
                      updateExportSessionPreferences({ lastMp3Bitrate: next });
                    }}
                    value={mp3Bitrate}
                  >
                    {ALLOWED_MP3_BITRATES.map((bitrate) => (
                      <option key={bitrate} value={bitrate}>
                        {formatMp3Bitrate(bitrate)}
                        {bitrate === 320 ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="export-prep-field">
                  <span>Optional export label</span>
                  <input
                    disabled={mp3Busy}
                    maxLength={120}
                    onChange={(event) => setMp3ExportLabel(event.target.value)}
                    placeholder="MP3 reference export"
                    type="text"
                    value={mp3ExportLabel}
                  />
                </label>
                <button
                  className="export-prep-create-button export-prep-create-button-mp3"
                  disabled={!mp3Available || !localStatus.online || mp3Busy || !selectedWavExportId}
                  onClick={() => void handleCreateMp3Export()}
                  type="button"
                >
                  {mp3Busy ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                      Creating local MP3 reference…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden="true" size={16} />
                      Create local MP3 reference
                    </>
                  )}
                </button>
                {mp3ErrorMessage ? <p className="export-prep-error">{mp3ErrorMessage}</p> : null}
                {mp3ExportResult?.ok ? <Mp3ExportResultBlock result={mp3ExportResult} /> : null}
              </>
            )}
          </div>

          <div className="export-prep-form export-prep-form-section export-prep-mastering">
            <h4>Mastering presets (local prototype)</h4>
            <p className="export-prep-not-mastered">{MASTERING_PROTOTYPE_NOTICE}</p>
            <p className="export-prep-not-mastered">{MASTERING_DJ_REVIEW_NOTICE}</p>
            <p className="export-prep-wav-only">{MASTERING_NO_RIGHTS_NOTICE}</p>

            {masteringLocked ? (
              <p className="export-prep-wav-only">
                Create a local WAV export first to unlock mastering presets.
              </p>
            ) : (
              <>
                <label className="export-prep-field">
                  <span>WAV export source</span>
                  <select
                    disabled={masterBusy || wavExports.length === 0}
                    onChange={(event) => setSelectedWavExportId(event.target.value)}
                    value={selectedWavExportId}
                  >
                    {wavExports.map((item) => (
                      <option key={item.artifactId} value={item.artifactId}>
                        {item.exportSubtype ?? "wav"} — {item.artifactId} (
                        {item.durationSeconds?.toFixed(1) ?? "?"}s)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="export-prep-field">
                  <span>Mastering preset</span>
                  <select
                    disabled={masterBusy}
                    onChange={(event) =>
                      setMasteringPreset(event.target.value as MasteringPresetId)
                    }
                    value={masteringPreset}
                  >
                    {MASTERING_PRESET_DEFINITIONS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="export-prep-preset-description">{selectedPresetDef.description}</p>
                <p className="export-prep-preset-targets">
                  Target: {formatTargetLoudnessSummary(selectedPresetDef)}
                </p>
                <ul className="export-prep-warnings">
                  {selectedPresetDef.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <label className="export-prep-field">
                  <span>Optional label</span>
                  <input
                    disabled={masterBusy}
                    maxLength={120}
                    onChange={(event) => setMasterExportLabel(event.target.value)}
                    placeholder="Mastering prototype label"
                    type="text"
                    value={masterExportLabel}
                  />
                </label>
                <button
                  className="export-prep-create-button export-prep-create-button-master"
                  disabled={
                    !masteringAvailable || !localStatus.online || masterBusy || !selectedWavExportId
                  }
                  onClick={() => void handleRunMasteringPreset()}
                  type="button"
                >
                  {masterBusy ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                      Running mastering preset…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden="true" size={16} />
                      Run mastering preset
                    </>
                  )}
                </button>
                {masterErrorMessage ? (
                  <p className="export-prep-error">{masterErrorMessage}</p>
                ) : null}
                {masterResult?.ok ? <MasterResultBlock result={masterResult} /> : null}
              </>
            )}
          </div>

          <div className="export-prep-form export-prep-form-section export-prep-package">
            <h4>Project package / stem package</h4>
            <p className="export-prep-not-mastered">{PACKAGE_EXPORT_NOTICE}</p>
            <p className="export-prep-wav-only">{PACKAGE_RAW_UPLOADS_EXCLUDED_NOTICE}</p>
            <p className="export-prep-wav-only">{PACKAGE_MANIFEST_ALWAYS_INCLUDED}</p>

            {packageableArtifacts.length === 0 ? (
              <p className="export-prep-wav-only">
                Create stem previews, combined preview, or exports first to unlock project packaging.
              </p>
            ) : (
              <>
                <fieldset className="export-prep-package-artifacts">
                  <legend>Eligible artifacts</legend>
                  {packageableArtifacts.map((artifact) => (
                    <label className="export-prep-package-checkbox" key={artifact.artifactId}>
                      <input
                        checked={selectedPackageArtifactIds.includes(artifact.artifactId)}
                        disabled={packageBusy}
                        onChange={() => togglePackageArtifact(artifact.artifactId)}
                        type="checkbox"
                      />
                      <span>{formatPackageableArtifactOption(artifact)}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="export-prep-field">
                  <span>Package label</span>
                  <input
                    disabled={packageBusy}
                    maxLength={120}
                    onChange={(event) => setPackageLabel(event.target.value)}
                    placeholder="My mashup project"
                    type="text"
                    value={packageLabel}
                  />
                </label>
                <label className="export-prep-field">
                  <span>Package type</span>
                  <select
                    disabled={packageBusy}
                    onChange={(event) => setPackageType(event.target.value as PackageType)}
                    value={packageType}
                  >
                    {ALLOWED_PACKAGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "folder" ? "Folder (default)" : "ZIP archive"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="export-prep-checkbox">
                  <input
                    checked={includeTechnicalReport}
                    disabled={packageBusy}
                    onChange={(event) => setIncludeTechnicalReport(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Include technical report (JSON + Markdown)</span>
                </label>
                <button
                  className="export-prep-create-button export-prep-create-button-package"
                  disabled={!packageAvailable || !localStatus.online || packageBusy}
                  onClick={() => void handleCreateProjectPackage()}
                  type="button"
                >
                  {packageBusy ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                      Creating local project package…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden="true" size={16} />
                      Create local project package
                    </>
                  )}
                </button>
                {packageErrorMessage ? (
                  <p className="export-prep-error">{packageErrorMessage}</p>
                ) : null}
                {packageResult?.ok ? <PackageResultBlock result={packageResult} /> : null}
              </>
            )}
          </div>

          {sessionPrefs.lastSuccessfulExport ? (
            <div className="export-prep-session-summary">
              <h4>Last successful export</h4>
              <p>
                {sessionPrefs.lastSuccessfulExport.mode} ·{" "}
                {sessionPrefs.lastSuccessfulExport.exportArtifactId} ·{" "}
                {sessionPrefs.lastSuccessfulExport.exportFormat.toUpperCase()}
                {sessionPrefs.lastSuccessfulExport.bitrateKbps
                  ? ` · ${formatMp3Bitrate(sessionPrefs.lastSuccessfulExport.bitrateKbps)}`
                  : ""}
              </p>
              {canReExport ? (
                <button
                  className="export-prep-reexport-button"
                  disabled={reExportBusy || busy || fullBusy || mp3Busy || masterBusy || !localStatus.online}
                  onClick={() => void handleReExportWithCurrentSettings()}
                  type="button"
                >
                  {reExportBusy ? "Re-exporting…" : "Re-export with current settings"}
                </button>
              ) : null}
            </div>
          ) : null}
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
            ) : target.id === "mp3" && mp3Available ? (
              <span className="export-prep-card-status">Available above</span>
            ) : target.id === "dj-preview-master" && masteringAvailable ? (
              <span className="export-prep-card-status">Available above</span>
            ) : target.id === "stems" && packageAvailable ? (
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
          packageResult?.rightsNotice ??
          masterResult?.rightsNotice ??
          mp3ExportResult?.rightsNotice ??
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

function PackageResultBlock({ result }: { result: PackageExportResult }) {
  return (
    <div className="export-prep-result export-prep-result-package">
      <p>{formatPackageManifestSummary(result)}</p>
      <p>
        Package artifact <strong>{result.packageArtifactId}</strong>
        {result.localFolderPath ? <> · folder: {result.localFolderPath}</> : null}
      </p>
      {result.manifestPath ? <p>Manifest: {result.manifestPath}</p> : null}
      {result.rightsNoticePath ? <p>Rights notice: {result.rightsNoticePath}</p> : null}
      {result.technicalReportPath ? <p>Technical report: {result.technicalReportPath}</p> : null}
      {result.playbackUrl ? (
        <a className="export-prep-download-link" download href={result.playbackUrl}>
          Download local package ZIP
        </a>
      ) : null}
      {result.includedFiles.length > 0 ? (
        <ul className="export-prep-package-files">
          {result.includedFiles.map((file) => (
            <li key={`${file.artifactId}-${file.packagePath}`}>
              {file.packagePath} ({file.artifactType}
              {file.artifactSubtype ? ` / ${file.artifactSubtype}` : ""})
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="export-prep-warnings">
        {formatPackageWarnings(result).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function MasterResultBlock({ result }: { result: MasterWavResult }) {
  return (
    <div className="export-prep-result export-prep-result-master">
      <p>
        Master artifact <strong>{result.masterArtifactId}</strong> · preset{" "}
        {formatMasteringPresetName(result.preset)} · source WAV{" "}
        {result.sourceWavExportArtifactId}
      </p>
      <p className="export-prep-readout-label">Before</p>
      <p>{formatReadoutLoudnessLine(result.beforeReadout)}</p>
      <p className="export-prep-readout-label">After</p>
      <p>{formatReadoutLoudnessLine(result.afterReadout)}</p>
      {result.loudnessGate ? (
        <p className={`export-prep-loudness-gate export-prep-loudness-gate-${result.loudnessGate.status}`}>
          Gate ({formatGateStatus(result.loudnessGate)}): {result.loudnessGate.message}
        </p>
      ) : null}
      {result.playbackUrl ? (
        <>
          <audio controls preload="none" src={result.playbackUrl} />
          <a className="export-prep-download-link" download href={result.playbackUrl}>
            Download local master WAV
          </a>
        </>
      ) : (
        <p className="export-prep-wav-only">Measurement-only — no master audio file written.</p>
      )}
      <ul className="export-prep-warnings">
        {formatMasteringWarnings(result).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="export-prep-final-export">
        finalExport: {String(result.finalExport)} · publicShare: {String(result.publicShare)} ·
        masteringPrototype: {String(result.masteringPrototype)}
      </p>
    </div>
  );
}

function Mp3ExportResultBlock({ result }: { result: Mp3ExportResult }) {
  return (
    <div className="export-prep-result export-prep-result-mp3">
      <p>
        MP3 reference export <strong>{result.exportArtifactId}</strong> from WAV export{" "}
        {result.sourceWavExportArtifactId} · {formatMp3Bitrate(result.bitrateKbps)}
      </p>
      <TechnicalSummary
        codec={result.codec ?? "mp3"}
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
            Download local MP3 reference
          </a>
        </>
      ) : null}
      <ul className="export-prep-warnings">
        {formatMp3ExportWarnings(result).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="export-prep-final-export">
        finalExport: {String(result.finalExport)} · publicShare: {String(result.publicShare)}
      </p>
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
