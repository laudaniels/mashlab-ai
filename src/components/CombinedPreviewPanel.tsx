import { AlertTriangle, Headphones, LoaderCircle, PlayCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildCombinedPreviewRequestParams,
  COMBINED_PREVIEW_ONLY_NOTICE,
  COMBINED_PREVIEW_PROCESSED_LABEL,
  combinedPreviewDurationWarning,
  formatCombinedPreviewStatusMessage,
  isCombinedPreviewReady,
  resolveCombinedPreviewDirections,
  validateCombinedPreviewDuration,
  validateCombinedPreviewStartOffset,
  type CombinedPreviewResult,
} from "../domain/combinedPreview.ts";
import {
  COMBINED_PREVIEW_DEFAULT_SECONDS,
  COMBINED_PREVIEW_DURATION_OPTIONS,
} from "../domain/combinedPreviewConstants.ts";
import {
  buildPitchTimePlanFromArtifacts,
  rubberBandReadinessFromCapabilityStatus,
  type MashIntent,
} from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import { formatPlanningSource } from "../domain/trackOverrides.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import {
  isRubberBandAvailable,
  rubberBandCapabilitySummary,
} from "../lib/localEngine/capabilities.ts";
import { validateCombinedPreviewRequestParams } from "../lib/localEngine/combinedPreview.ts";
import { loadMixSettings, saveMixSettings } from "../lib/mixSession.ts";
import {
  formatSectionBindingSummary,
  PREVIEW_START_OFFSET_PENDING_NOTICE,
  type SectionPreviewBinding,
} from "../domain/arrangementSectionBinding.ts";
import {
  ARRANGEMENT_SECTIONS_ADVISORY_NOTICE,
  buildPitchTimePlanSnapshot,
  evaluateBindingFreshness,
  formatBindingFreshnessLabel,
  type ArrangementSectionContext,
} from "../domain/arrangementSectionContext.ts";
import {
  loadArrangementSectionContext,
  loadPreviewConfigurationSource,
  loadSelectedArrangementSection,
  loadSelectedDraftType,
} from "../lib/arrangementDraftSession.ts";
import { MixControlsPanel } from "./MixControlsPanel.tsx";
import type { MixSettings } from "../domain/mixControls.ts";
import { validateMixSettings } from "../domain/mixControls.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";

interface CombinedPreviewPanelProps {
  artifactStore: SessionArtifactStore;
  intent: MashIntent;
  onCombinedPreviewComplete?: (params: {
    artifactId: string;
    mashIntent: string;
    sourceTrackSlot: "trackA" | "trackB";
    targetTrackSlot: "trackA" | "trackB";
    label: string;
  }) => void;
}

export function CombinedPreviewPanel({
  artifactStore,
  intent,
  onCombinedPreviewComplete,
}: CombinedPreviewPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandAvailable = isRubberBandAvailable(localStatus.capabilities);
  const rubberBandStatus = rubberBandReadinessFromCapabilityStatus(rubberBand.status);

  const plan = buildPitchTimePlanFromArtifacts({
    artifactStore,
    intent,
    rubberBandStatus,
    rubberBandMessage: rubberBand.message,
  });

  const [useNeutralProcessing, setUseNeutralProcessing] = useState(false);
  const [previewDurationSeconds, setPreviewDurationSeconds] = useState(COMBINED_PREVIEW_DEFAULT_SECONDS);
  const [customDurationSeconds, setCustomDurationSeconds] = useState(String(COMBINED_PREVIEW_DEFAULT_SECONDS));
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CombinedPreviewResult | null>>({});
  const [mixSettings, setMixSettings] = useState<MixSettings>(() => loadMixSettings());
  const [previewStartSeconds, setPreviewStartSeconds] = useState(0);
  const [sectionBinding, setSectionBinding] = useState<SectionPreviewBinding | null>(null);
  const [sectionContext, setSectionContext] = useState<ArrangementSectionContext | null>(null);
  const [appliedDraftNotice, setAppliedDraftNotice] = useState<string | null>(null);
  const [startOffsetNotice, setStartOffsetNotice] = useState<string | null>(null);

  const bindingFreshness = useMemo(
    () =>
      evaluateBindingFreshness({
        binding: sectionBinding,
        context: sectionContext,
        currentMashIntent: intent,
        currentMixSettings: mixSettings,
        currentDraftType: loadSelectedDraftType(),
        currentSectionId: loadSelectedArrangementSection()?.sectionId ?? null,
        artifactStore,
        currentPitchTime: buildPitchTimePlanSnapshot(plan?.directions[0] ?? null),
      }),
    [sectionBinding, sectionContext, intent, mixSettings, artifactStore, plan]
  );

  useEffect(() => {
    const config = loadPreviewConfigurationSource();
    if (!config) {
      return;
    }

    if (config.source === "section_binding") {
      const binding = config.binding;
      setSectionBinding(binding);
      setSectionContext(loadArrangementSectionContext());
      setPreviewDurationSeconds(binding.previewDurationSeconds);
      setCustomDurationSeconds(String(binding.previewDurationSeconds));
      setMixSettings(binding.mixSettings);
      saveMixSettings(binding.mixSettings);
      setAppliedDraftNotice(
        `Arrangement section "${binding.sectionLabel}" loaded — click Create combined preview when ready.`
      );
      if (binding.startOffsetStatus === "applied") {
        setPreviewStartSeconds(binding.previewStartSeconds ?? 0);
        setStartOffsetNotice(
          binding.previewStartSeconds && binding.previewStartSeconds > 0
            ? `Start offset ${binding.previewStartSeconds.toFixed(1)}s will be sent when you create preview.`
            : "Preview begins at source artifact start (0s)."
        );
      } else {
        setPreviewStartSeconds(0);
        setStartOffsetNotice(PREVIEW_START_OFFSET_PENDING_NOTICE);
      }
      return;
    }

    setPreviewDurationSeconds(config.settings.previewDurationSeconds);
    setCustomDurationSeconds(String(config.settings.previewDurationSeconds));
    setMixSettings(config.settings.mixSettings);
    saveMixSettings(config.settings.mixSettings);
    setPreviewStartSeconds(0);
    setStartOffsetNotice(null);
    setAppliedDraftNotice(
      `Arrangement draft "${config.settings.draftType.replace(/_/g, " ")}" settings loaded — click Create combined preview when ready.`
    );
  }, []);

  if (!plan) {
    return (
      <section className="combined-preview-panel combined-preview-panel-empty">
        <p>Load and analyze both tracks before creating a combined preview.</p>
      </section>
    );
  }

  const directions = resolveCombinedPreviewDirections(artifactStore, intent, plan.directions);

  async function handleCreatePreview(contextKey: string) {
    const context = directions.find((item) => item.intentLabel === contextKey);
    if (!context) {
      return;
    }

    const readiness = isCombinedPreviewReady({
      sidecarOnline: localStatus.online,
      rubberBandAvailable,
      context,
      useNeutralProcessing,
    });

    if (!readiness.ready) {
      setResults((current) => ({
        ...current,
        [contextKey]: {
          ok: false,
          status: "not_ready",
          message: readiness.reason,
          method: null,
          audioProcessed: false,
          finalExport: false,
          artifactId: null,
          artifactUrl: null,
          artifactPlaybackUrl: null,
          inputSummary: null,
          processingSummary: null,
          outputDurationSeconds: null,
          warnings: [],
          limitations: [COMBINED_PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors: [],
          isPreviewOnly: true,
        },
      }));
      return;
    }

    const params = buildCombinedPreviewRequestParams(
      context,
      useNeutralProcessing,
      previewDurationSeconds,
      mixSettings,
      previewStartSeconds
    );
    if (sectionContext) {
      params.arrangementContext = {
        ...sectionContext,
        exportContextMode: "preview_section",
      };
    }
    const durationErrors = validateCombinedPreviewDuration(previewDurationSeconds);
    const startErrors = validateCombinedPreviewStartOffset(previewStartSeconds);
    const mixErrors = validateMixSettings(mixSettings);
    const validationErrors = [
      ...validateCombinedPreviewRequestParams(params),
      ...durationErrors,
      ...startErrors,
      ...mixErrors,
    ];
    if (validationErrors.length > 0) {
      setResults((current) => ({
        ...current,
        [contextKey]: {
          ok: false,
          status: "validation_error",
          message: "Combined preview request failed client-side validation.",
          method: null,
          audioProcessed: false,
          finalExport: false,
          artifactId: null,
          artifactUrl: null,
          artifactPlaybackUrl: null,
          inputSummary: null,
          processingSummary: null,
          outputDurationSeconds: null,
          warnings: [],
          limitations: [COMBINED_PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors,
          isPreviewOnly: true,
        },
      }));
      return;
    }

    setProcessingKey(contextKey);
    const result = await localEngineClient.processCombinedPreview(params);
    setProcessingKey(null);
    const resolved =
      result ??
      ({
        ok: false,
        status: "request_failed",
        message: "Combined preview request failed. Check that the local sidecar is running.",
        method: null,
        audioProcessed: false,
        finalExport: false,
        artifactId: null,
        artifactUrl: null,
        artifactPlaybackUrl: null,
        inputSummary: null,
        processingSummary: null,
        outputDurationSeconds: null,
        warnings: [],
        limitations: [COMBINED_PREVIEW_ONLY_NOTICE],
        setupGuidance: null,
        validationErrors: [],
        isPreviewOnly: true,
      } satisfies CombinedPreviewResult);

    if (resolved.ok && resolved.artifactId) {
      onCombinedPreviewComplete?.({
        artifactId: resolved.artifactId,
        mashIntent: context.mashIntent,
        sourceTrackSlot: context.sourceVocalSlotId,
        targetTrackSlot: context.targetInstrumentalSlotId,
        label: context.intentLabel,
      });
    }

    setResults((current) => ({
      ...current,
      [contextKey]: resolved,
    }));
  }

  return (
    <section className="combined-preview-panel" aria-label="Combined mashup preview">
      <div className="combined-preview-header">
        <Sparkles aria-hidden="true" size={20} />
        <div>
          <h3>Combined Preview</h3>
          <p>{COMBINED_PREVIEW_ONLY_NOTICE}</p>
          <p className="combined-preview-note">
            First vocal-over-instrumental preview using stem artifacts, Rubber Band vocal adjustment,
            and FFmpeg mixing. Not a finished mashup.
          </p>
          {appliedDraftNotice ? <p className="combined-preview-applied-draft">{appliedDraftNotice}</p> : null}
          {sectionBinding ? (
            <p className="combined-preview-applied-draft">
              {formatSectionBindingSummary(sectionBinding)}
            </p>
          ) : null}
          {bindingFreshness.status !== "current" && bindingFreshness.status !== "unavailable" ? (
            <p className="combined-preview-stale-binding" role="status">
              <AlertTriangle aria-hidden="true" size={16} />
              {formatBindingFreshnessLabel(bindingFreshness.status)}: {bindingFreshness.summary}{" "}
              Re-apply on Drafts or continue manually.
            </p>
          ) : null}
          <p className="combined-preview-advisory">{ARRANGEMENT_SECTIONS_ADVISORY_NOTICE}</p>
          {startOffsetNotice ? (
            <p className="combined-preview-offset-note">{startOffsetNotice}</p>
          ) : null}
        </div>
        <span className={`planning-badge planning-badge-${rubberBandBadgeClass(rubberBand.status)}`}>
          Rubber Band: {rubberBand.status}
        </span>
      </div>

      <label className="combined-preview-neutral-toggle">
        <input
          checked={useNeutralProcessing}
          onChange={(event) => setUseNeutralProcessing(event.currentTarget.checked)}
          type="checkbox"
        />
        Use neutral pitch/time (1.0 ratio, 0 semitones) when BPM/key data is missing
      </label>

      <div className="combined-preview-duration-row">
        <span className="combined-preview-duration-label">Preview duration</span>
        <div className="combined-preview-duration-options">
          {COMBINED_PREVIEW_DURATION_OPTIONS.map((seconds) => (
            <button
              className={`combined-preview-duration-button ${
                previewDurationSeconds === seconds ? "active" : ""
              }`}
              key={seconds}
              onClick={() => {
                setPreviewDurationSeconds(seconds);
                setCustomDurationSeconds(String(seconds));
              }}
              type="button"
            >
              {seconds}s
            </button>
          ))}
        </div>
        <label className="combined-preview-custom-duration">
          Custom (max 60s)
          <input
            max={60}
            min={1}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setCustomDurationSeconds(event.currentTarget.value);
              if (Number.isFinite(next)) {
                setPreviewDurationSeconds(next);
              }
            }}
            type="number"
            value={customDurationSeconds}
          />
        </label>
        {combinedPreviewDurationWarning(previewDurationSeconds) ? (
          <p className="combined-preview-duration-warning">
            {combinedPreviewDurationWarning(previewDurationSeconds)}
          </p>
        ) : null}
      </div>

      <MixControlsPanel
        disabled={processingKey !== null}
        onChange={setMixSettings}
        settings={mixSettings}
      />

      <div className="combined-preview-grid">
        {directions.map((context) => {
          const readiness = isCombinedPreviewReady({
            sidecarOnline: localStatus.online,
            rubberBandAvailable,
            context,
            useNeutralProcessing,
          });
          const result = results[context.intentLabel] ?? null;
          const isProcessing = processingKey === context.intentLabel;
          const direction = context.direction;

          return (
            <article className="combined-preview-card" key={context.intentLabel}>
              <h4>{context.intentLabel}</h4>

              <dl className="combined-preview-stem-status">
                <div>
                  <dt>Vocal stem</dt>
                  <dd>{context.sourceVocalArtifactId ?? "Missing — create stem preview"}</dd>
                </div>
                <div>
                  <dt>Instrumental stem</dt>
                  <dd>
                    {context.targetInstrumentalArtifactId ?? "Missing — create stem preview"}
                  </dd>
                </div>
              </dl>

              <dl className="combined-preview-params">
                <div>
                  <dt>Tempo ratio</dt>
                  <dd>
                    {useNeutralProcessing ? "1.0 (neutral)" : (direction.tempoStretchRatio ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt>Pitch shift</dt>
                  <dd>
                    {useNeutralProcessing
                      ? "0 semitones (neutral)"
                      : direction.suggestedPitchShiftSemitones === null
                        ? "—"
                        : `${direction.suggestedPitchShiftSemitones} semitones`}
                  </dd>
                </div>
                <div>
                  <dt>Alignment</dt>
                  <dd>{context.alignmentOffsetMs} ms</dd>
                </div>
              </dl>

              <p className="combined-preview-plan-note">
                BPM source: {formatPlanningSource(direction.bpmSource)} · Key source:{" "}
                {formatPlanningSource(direction.keySource)}
              </p>

              {direction.safeRangeWarning ? (
                <div className="planning-warning">
                  <AlertTriangle aria-hidden="true" size={18} />
                  <span>{direction.safeRangeWarning}</span>
                </div>
              ) : null}

              <button
                className="combined-preview-button"
                disabled={!readiness.ready || isProcessing}
                onClick={() => void handleCreatePreview(context.intentLabel)}
                type="button"
              >
                {isProcessing ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
                    Building combined preview…
                  </>
                ) : (
                  <>
                    <PlayCircle aria-hidden="true" size={18} />
                    Create combined preview
                  </>
                )}
              </button>

              {!readiness.ready ? (
                <p className="combined-preview-disabled-note">{readiness.reason}</p>
              ) : (
                <p className="combined-preview-action-note">
                  User action required — combined preview does not run automatically.
                </p>
              )}

              {result ? (
                <div
                  className={`combined-preview-result ${result.ok ? "success" : "error"}`}
                  aria-live="polite"
                >
                  <p>{formatCombinedPreviewStatusMessage(result)}</p>
                  {result.setupGuidance ? <p>{result.setupGuidance}</p> : null}
                  {result.validationErrors.length > 0 ? (
                    <ul>
                      {result.validationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                  {result.warnings.map((warning) => (
                    <p className="combined-preview-warning" key={warning}>
                      {warning}
                    </p>
                  ))}

                  {result.ok && result.audioProcessed && result.artifactPlaybackUrl ? (
                    <div className="combined-preview-playback">
                      <p className="combined-preview-artifact-label">
                        {COMBINED_PREVIEW_PROCESSED_LABEL}
                      </p>
                      <Headphones aria-hidden="true" size={18} />
                      <audio controls preload="none" src={result.artifactPlaybackUrl} />
                      {result.processingSummary ? (
                        <dl className="combined-preview-metadata">
                          <div>
                            <dt>Mix method</dt>
                            <dd>{result.processingSummary.method}</dd>
                          </div>
                          <div>
                            <dt>Duration</dt>
                            <dd>
                              {result.outputDurationSeconds !== null
                                ? `${result.outputDurationSeconds.toFixed(1)}s`
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function rubberBandBadgeClass(status: string): string {
  switch (status) {
    case "available":
      return "strong";
    case "missing":
      return "risky";
    default:
      return "unknown";
  }
}
