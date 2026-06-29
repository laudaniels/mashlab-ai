import { AlertTriangle, LayoutTemplate, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  applyDraftSettingsFromPlan,
  ARRANGEMENT_PLANNING_ONLY_NOTICE,
  buildArrangementPlan,
  DRAFT_TEMPLATE_DEFINITIONS,
  formatArrangementSectionTimeline,
  formatExportModeLabel,
  getDraftTemplateDefinition,
  type DraftType,
} from "../domain/arrangementPlanning.ts";
import {
  rubberBandReadinessFromCapabilityStatus,
  type MashIntent,
} from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import {
  loadAppliedDraftSettings,
  loadSelectedDraftType,
  saveAppliedDraftSettings,
  saveSelectedDraftType,
} from "../lib/arrangementDraftSession.ts";
import { rubberBandCapabilitySummary } from "../lib/localEngine/capabilities.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import { formatMixSettingsSummary } from "../domain/mixControls.ts";

interface ArrangementPlanPanelProps {
  artifactStore: SessionArtifactStore;
  mashIntent: MashIntent;
  onIntentChange: (intent: MashIntent) => void;
  onDraftApplied?: () => void;
}

export function ArrangementPlanPanel({
  artifactStore,
  mashIntent,
  onIntentChange,
  onDraftApplied,
}: ArrangementPlanPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandStatus = rubberBandReadinessFromCapabilityStatus(rubberBand.status);

  const [draftType, setDraftType] = useState<DraftType>(() => loadSelectedDraftType());
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

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
      }),
    [artifactStore, draftType, mashIntent, rubberBand.message, rubberBandStatus]
  );

  const applied = loadAppliedDraftSettings();

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

  function handleApplyDraftSettings() {
    const appliedSettings = applyDraftSettingsFromPlan(plan!);
    saveAppliedDraftSettings(appliedSettings);
    onIntentChange(appliedSettings.mashIntent);
    setAppliedMessage(
      `Draft settings applied — mash intent, ${appliedSettings.previewDurationSeconds}s preview target, and mix reference saved. Create preview or export manually next.`
    );
    onDraftApplied?.();
  }

  const template = getDraftTemplateDefinition(draftType);
  const sectionLines = formatArrangementSectionTimeline(plan.arrangementSections);

  return (
    <section className="arrangement-plan-panel" aria-label="Arrangement draft plan">
      <div className="arrangement-plan-header">
        <LayoutTemplate aria-hidden="true" size={20} />
        <div>
          <h3>Arrangement Draft Plan</h3>
          <p>{ARRANGEMENT_PLANNING_ONLY_NOTICE}</p>
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
          <dt>Source vocal</dt>
          <dd>{plan.sourceTrackLabel}</dd>
        </div>
        <div>
          <dt>Target bed</dt>
          <dd>{plan.targetTrackLabel}</dd>
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
        <h4>Tempo plan</h4>
        <p>{plan.tempoPlanSummary}</p>
      </div>

      <div className="arrangement-plan-block">
        <h4>Key / pitch plan</h4>
        <p>{plan.keyPitchPlanSummary}</p>
        <p className="arrangement-plan-note">{plan.phraseBasisDetail}</p>
      </div>

      <div className="arrangement-plan-block">
        <h4>Section timeline (advisory)</h4>
        <ul className="arrangement-section-list">
          {sectionLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="arrangement-plan-block">
        <h4>Suggested handoff</h4>
        <p>Preview duration: {plan.suggestedPreviewSeconds}s</p>
        <p>Export mode: {formatExportModeLabel(plan.suggestedExportMode)}</p>
        <p>Mix reference: {formatMixSettingsSummary(plan.mixSettingsReference)}</p>
      </div>

      {plan.missingRequirements.length > 0 ? (
        <div className="arrangement-plan-warnings">
          <AlertTriangle aria-hidden="true" size={16} />
          <ul>
            {plan.missingRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
      </div>

      {appliedMessage ? <p className="arrangement-plan-applied">{appliedMessage}</p> : null}
      {applied ? (
        <p className="arrangement-plan-applied-note">
          Last applied: {applied.draftType.replace(/_/g, " ")} at{" "}
          {new Date(applied.appliedAt).toLocaleString()} — still requires manual preview/export.
        </p>
      ) : null}
    </section>
  );
}
