import { AlertTriangle, ArrowRight, LayoutTemplate, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  applyDraftSettingsFromPlan,
  ARRANGEMENT_PLANNING_ONLY_NOTICE,
  buildArrangementPlan,
  DRAFT_TEMPLATE_DEFINITIONS,
  findArrangementSection,
  formatExportModeLabel,
  getDraftTemplateDefinition,
  resolveTargetBedBpm,
  type DraftType,
} from "../domain/arrangementPlanning.ts";
import {
  ARRANGEMENT_SECTION_BINDING_NOTICE,
  bindSectionToPreviewSettings,
  formatSectionBindingSummary,
  selectArrangementSection,
  type AppScreenId,
} from "../domain/arrangementSectionBinding.ts";
import {
  ARRANGEMENT_SECTIONS_ADVISORY_NOTICE,
  buildPitchTimePlanSnapshot,
  buildSectionContextFromBinding,
  evaluateBindingFreshness,
  formatArrangementContextSummary,
  formatBindingFreshnessLabel,
} from "../domain/arrangementSectionContext.ts";
import {
  buildPitchTimePlanFromArtifacts,
  rubberBandReadinessFromCapabilityStatus,
  type MashIntent,
} from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import {
  loadAppliedDraftSettings,
  loadArrangementSectionContext,
  loadSectionPreviewBinding,
  loadSelectedArrangementSection,
  loadSelectedDraftType,
  saveAppliedDraftSettings,
  saveArrangementSectionContext,
  saveSectionPreviewBinding,
  saveSelectedArrangementSection,
  saveSelectedDraftType,
} from "../lib/arrangementDraftSession.ts";
import { loadMixSettings } from "../lib/mixSession.ts";
import {
  isDemucsAvailable,
  isFfmpegAvailable,
  isRubberBandAvailable,
  rubberBandCapabilitySummary,
} from "../lib/localEngine/capabilities.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import { formatMixSettingsSummary } from "../domain/mixControls.ts";
import type { ArrangementSection } from "../domain/arrangementPlanning.ts";

interface ArrangementPlanPanelProps {
  artifactStore: SessionArtifactStore;
  mashIntent: MashIntent;
  onIntentChange: (intent: MashIntent) => void;
  onDraftApplied?: () => void;
  onNavigateToScreen?: (screen: AppScreenId) => void;
}

function formatSectionRow(section: ArrangementSection): string {
  const start =
    section.startTimeSeconds !== null ? `${section.startTimeSeconds.toFixed(1)}s` : "time TBD";
  const bars = section.durationBars !== null ? `${section.durationBars} bars` : "bars TBD";
  return `${section.label} · ${start} · ${bars} · ${section.basis.replace(/_/g, " ")}`;
}

export function ArrangementPlanPanel({
  artifactStore,
  mashIntent,
  onIntentChange,
  onDraftApplied,
  onNavigateToScreen,
}: ArrangementPlanPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandStatus = rubberBandReadinessFromCapabilityStatus(rubberBand.status);
  const rubberBandAvailable = isRubberBandAvailable(localStatus.capabilities);
  const demucsAvailable = isDemucsAvailable(localStatus.capabilities);
  const ffmpegAvailable = isFfmpegAvailable(localStatus.capabilities);

  const [draftType, setDraftType] = useState<DraftType>(() => loadSelectedDraftType());
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    () => loadSelectedArrangementSection()?.sectionId ?? null
  );
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const [bindingMessage, setBindingMessage] = useState<string | null>(null);

  useEffect(() => {
    saveSelectedDraftType(draftType);
  }, [draftType]);

  const plan = useMemo(
    () =>
      buildArrangementPlan({
        artifactStore,
        draftType,
        mashIntent,
        rubberBandStatus,
        rubberBandMessage: rubberBand.message,
        sidecarOnline: localStatus.online,
        rubberBandAvailable,
        demucsAvailable,
        ffmpegAvailable,
      }),
    [
      artifactStore,
      draftType,
      mashIntent,
      rubberBand.message,
      rubberBandStatus,
      localStatus.online,
      rubberBandAvailable,
      demucsAvailable,
      ffmpegAvailable,
    ]
  );

  const applied = loadAppliedDraftSettings();
  const sectionBinding = loadSectionPreviewBinding();
  const sectionContext = loadArrangementSectionContext();
  const selectedSection =
    plan && selectedSectionId ? findArrangementSection(plan, selectedSectionId) : null;

  const bindingFreshness = useMemo(() => {
    if (!plan) {
      return null;
    }
    const pitchPlan = buildPitchTimePlanFromArtifacts({
      artifactStore,
      intent: mashIntent,
      rubberBandStatus,
      rubberBandMessage: rubberBand.message,
    });
    return evaluateBindingFreshness({
      binding: sectionBinding,
      context: sectionContext,
      currentMashIntent: mashIntent,
      currentMixSettings: loadMixSettings(),
      currentDraftType: draftType,
      currentSectionId: selectedSectionId,
      artifactStore,
      currentPitchTime: buildPitchTimePlanSnapshot(pitchPlan?.directions[0] ?? null),
    });
  }, [
    plan,
    artifactStore,
    mashIntent,
    rubberBand.message,
    rubberBandStatus,
    sectionBinding,
    sectionContext,
    draftType,
    selectedSectionId,
  ]);

  if (!plan) {
    return (
      <section className="arrangement-plan-panel arrangement-plan-panel-empty">
        <div className="arrangement-plan-header">
          <LayoutTemplate aria-hidden="true" size={20} />
          <div>
            <h3>Arrangement Draft Plan</h3>
            <p>Load both tracks to generate arrangement draft templates.</p>
          </div>
        </div>
      </section>
    );
  }

  function handleSelectSection(section: ArrangementSection) {
    setSelectedSectionId(section.id);
    const targetBpm = resolveTargetBedBpm(artifactStore, plan!);
    saveSelectedArrangementSection(selectArrangementSection(plan!, section, targetBpm));
    setBindingMessage(null);
  }

  function handleApplyDraftSettings() {
    const appliedSettings = applyDraftSettingsFromPlan(plan!);
    saveAppliedDraftSettings(appliedSettings);
    onIntentChange(appliedSettings.mashIntent);
    setAppliedMessage(
      `Draft settings applied — mash intent, ${appliedSettings.previewDurationSeconds}s preview target, and mix reference saved. Create preview or export manually next.`
    );
    onDraftApplied?.();
  }

  function handleApplySectionToPreview() {
    if (!selectedSection) {
      return;
    }

    const targetBpm = resolveTargetBedBpm(artifactStore, plan!);
    const binding = bindSectionToPreviewSettings(plan!, selectedSection, targetBpm);
    const pitchPlan = buildPitchTimePlanFromArtifacts({
      artifactStore,
      intent: binding.mashIntent,
      rubberBandStatus,
      rubberBandMessage: rubberBand.message,
    });
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: buildPitchTimePlanSnapshot(pitchPlan?.directions[0] ?? null),
      artifactStore,
      exportContextMode: "preview_section",
    });
    saveSectionPreviewBinding(binding);
    saveArrangementSectionContext(context);
    saveAppliedDraftSettings({
      draftType: plan!.draftType,
      mashIntent: binding.mashIntent,
      previewDurationSeconds: binding.previewDurationSeconds,
      mixSettings: binding.mixSettings,
      exportMode: plan!.suggestedExportMode,
      appliedAt: binding.boundAt,
    });
    onIntentChange(binding.mashIntent);
    setBindingMessage(formatSectionBindingSummary(binding));
    onDraftApplied?.();
  }

  const template = getDraftTemplateDefinition(draftType);

  return (
    <section className="arrangement-plan-panel" aria-label="Arrangement draft plan">
      <div className="arrangement-plan-header">
        <LayoutTemplate aria-hidden="true" size={20} />
        <div>
          <h3>Arrangement Draft Plan</h3>
          <p>{ARRANGEMENT_PLANNING_ONLY_NOTICE}</p>
          <p className="arrangement-plan-binding-note">{ARRANGEMENT_SECTION_BINDING_NOTICE}</p>
          <p className="arrangement-plan-rights">{requiredRightsNotice}</p>
        </div>
        <span
          className={`planning-badge ${plan.readinessReady ? "planning-badge-ready" : "planning-badge-risky"}`}
        >
          {plan.readinessReady ? "Plan ready" : "Missing data"}
        </span>
      </div>

      <div className="arrangement-draft-picker">
        {DRAFT_TEMPLATE_DEFINITIONS.map((item) => (
          <button
            className={`arrangement-draft-card ${draftType === item.id ? "is-selected" : ""}`}
            key={item.id}
            onClick={() => setDraftType(item.id)}
            type="button"
          >
            <Sparkles aria-hidden="true" size={16} />
            <strong>{item.name}</strong>
            <span>{item.tagline}</span>
          </button>
        ))}
      </div>

      <dl className="arrangement-plan-summary">
        <div>
          <dt>Template</dt>
          <dd>{template.name}</dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>
            {plan.effectiveMashIntent === "vocal_a_over_beat_b"
              ? "Vocal A over Beat B"
              : "Vocal B over Beat A"}
          </dd>
        </div>
        <div>
          <dt>Phrase basis</dt>
          <dd>{plan.phraseBasis.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{plan.readinessReason}</dd>
        </div>
      </dl>

      <div className="arrangement-plan-block">
        <h4>Section timeline (advisory — select one)</h4>
        <ul className="arrangement-section-select-list">
          {plan.arrangementSections.map((section) => (
            <li key={section.id}>
              <button
                className={`arrangement-section-row ${
                  selectedSectionId === section.id ? "is-selected" : ""
                }`}
                onClick={() => handleSelectSection(section)}
                type="button"
              >
                <span>{formatSectionRow(section)}</span>
                <span className="arrangement-section-row-note">{section.description}</span>
              </button>
            </li>
          ))}
        </ul>
        {selectedSection ? (
          <div className="arrangement-selected-section">
            <strong>Selected:</strong> {selectedSection.label} · basis:{" "}
            {selectedSection.basis.replace(/_/g, " ")} · DJ review required
            {sectionContext ? (
              <p className="arrangement-traceability-summary">
                {formatArrangementContextSummary(sectionContext)}
              </p>
            ) : null}
            {bindingFreshness && sectionBinding ? (
              <p
                className={`arrangement-binding-freshness arrangement-binding-freshness-${bindingFreshness.status}`}
              >
                Binding status: {formatBindingFreshnessLabel(bindingFreshness.status)} —{" "}
                {bindingFreshness.summary}
              </p>
            ) : null}
            <p className="arrangement-advisory-notice">{ARRANGEMENT_SECTIONS_ADVISORY_NOTICE}</p>
          </div>
        ) : (
          <p className="arrangement-plan-note">Select an advisory section to bind preview settings.</p>
        )}
      </div>

      <div className="arrangement-plan-block">
        <h4>Suggested handoff</h4>
        <p>Preview duration: {plan.suggestedPreviewSeconds}s</p>
        <p>Export mode: {formatExportModeLabel(plan.suggestedExportMode)}</p>
        <p>Mix reference: {formatMixSettingsSummary(plan.mixSettingsReference)}</p>
      </div>

      {(plan.missingRequirements.length > 0 || plan.missingRequirementActions.length > 0) ? (
        <div className="arrangement-plan-missing">
          <AlertTriangle aria-hidden="true" size={16} />
          <div>
            <strong>Required steps</strong>
            <ul className="arrangement-missing-requirements">
              {plan.missingRequirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {plan.missingRequirementActions.map((action) => (
                <li key={action.id}>
                  <div className="arrangement-missing-action">
                    <span>
                      <strong>{action.label}:</strong> {action.requiredAction}
                      {action.dependencyHint ? ` (${action.dependencyHint})` : ""}
                    </span>
                    {onNavigateToScreen ? (
                      <button
                        className="arrangement-go-step-button"
                        onClick={() => onNavigateToScreen(action.targetScreen)}
                        type="button"
                      >
                        Go to required step
                        <ArrowRight aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {plan.warnings.length > 0 ? (
        <ul className="arrangement-plan-warning-list">
          {plan.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {plan.limitations.length > 0 ? (
        <ul className="arrangement-plan-limitations">
          {plan.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}

      <div className="arrangement-plan-actions">
        <button onClick={handleApplyDraftSettings} type="button">
          <Wand2 aria-hidden="true" size={16} />
          Apply draft settings
        </button>
        <button
          disabled={!selectedSection}
          onClick={handleApplySectionToPreview}
          type="button"
        >
          <Sparkles aria-hidden="true" size={16} />
          {bindingFreshness?.status === "stale" || bindingFreshness?.status === "partially_stale"
            ? "Re-apply section to preview settings"
            : "Apply section to preview settings"}
        </button>
      </div>

      {appliedMessage ? <p className="arrangement-plan-applied">{appliedMessage}</p> : null}
      {bindingMessage ? <p className="arrangement-plan-applied">{bindingMessage}</p> : null}
      {applied ? (
        <p className="arrangement-plan-applied-note">
          Last applied: {applied.draftType.replace(/_/g, " ")} at{" "}
          {new Date(applied.appliedAt).toLocaleString()} — still requires manual preview/export.
        </p>
      ) : null}
    </section>
  );
}
