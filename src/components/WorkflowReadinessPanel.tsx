import { CheckCircle2, Circle, CircleDashed, ListChecks, OctagonAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MashIntent } from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import type { SlotId, TrackState } from "../domain/types.ts";
import {
  buildWorkflowReadiness,
  countWorkflowArtifacts,
  formatWorkflowStepStatus,
  WORKFLOW_READINESS_NOTICE,
  workflowStepsComplete,
  type WorkflowStepStatus,
} from "../domain/workflowReadiness.ts";
import type { MashTrackJob } from "../domain/jobs.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { loadPreviewArtifactRegistry } from "../lib/previewArtifactRegistry.ts";
import { subscribeArtifactRefresh } from "../lib/artifactRefresh.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import {
  loadAppliedDraftSettings,
  loadArrangementSectionContext,
  loadSectionPreviewBinding,
  loadSelectedArrangementSection,
  loadSelectedDraftType,
} from "../lib/arrangementDraftSession.ts";
import { loadMixSettings } from "../lib/mixSession.ts";
import {
  buildPitchTimePlanSnapshot,
  evaluateBindingFreshness,
} from "../domain/arrangementSectionContext.ts";
import { buildPitchTimePlanFromArtifacts, rubberBandReadinessFromCapabilityStatus } from "../domain/pitchTimePlanning.ts";
import { rubberBandCapabilitySummary } from "../lib/localEngine/capabilities.ts";

interface WorkflowReadinessPanelProps {
  tracks: Record<SlotId, TrackState | null>;
  trackJobs: Record<SlotId, MashTrackJob | null>;
  artifactStore: SessionArtifactStore;
  mashIntent: MashIntent;
}

export function WorkflowReadinessPanel({
  tracks,
  trackJobs,
  artifactStore,
  mashIntent,
}: WorkflowReadinessPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandStatus = rubberBandReadinessFromCapabilityStatus(rubberBand.status);
  const pitchPlan = buildPitchTimePlanFromArtifacts({
    artifactStore,
    intent: mashIntent,
    rubberBandStatus,
    rubberBandMessage: rubberBand.message,
  });
  const bindingFreshness = evaluateBindingFreshness({
    binding: loadSectionPreviewBinding(),
    context: loadArrangementSectionContext(),
    currentMashIntent: mashIntent,
    currentMixSettings: loadMixSettings(),
    currentDraftType: loadSelectedDraftType(),
    currentSectionId: loadSelectedArrangementSection()?.sectionId ?? null,
    artifactStore,
    currentPitchTime: buildPitchTimePlanSnapshot(pitchPlan?.directions[0] ?? null),
  });
  const [artifactCounts, setArtifactCounts] = useState(countWorkflowArtifacts([]));

  const refreshCounts = useCallback(async () => {
    if (!localStatus.online) {
      setArtifactCounts(countWorkflowArtifacts([]));
      return;
    }

    const registry = loadPreviewArtifactRegistry();
    const listed = await localEngineClient.listArtifacts(registry);
    setArtifactCounts(countWorkflowArtifacts(listed));
  }, [localStatus.online]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => subscribeArtifactRefresh(() => void refreshCounts()), [refreshCounts]);

  const steps = useMemo(
    () =>
      buildWorkflowReadiness({
        tracks,
        trackJobs,
        artifactStore,
        sidecarOnline: localStatus.online,
        capabilities: localStatus.capabilities,
        artifactCounts,
        arrangementDraftSelected: Boolean(loadSelectedDraftType()),
        arrangementDraftApplied: Boolean(loadAppliedDraftSettings()),
        arrangementSectionBound: Boolean(loadSectionPreviewBinding()),
        arrangementBindingStale:
          bindingFreshness.status === "stale" || bindingFreshness.status === "partially_stale",
      }),
    [
      tracks,
      trackJobs,
      artifactStore,
      localStatus.online,
      localStatus.capabilities,
      artifactCounts,
      mashIntent,
      bindingFreshness.status,
    ]
  );

  const completeCount = workflowStepsComplete(steps);

  return (
    <section className="workflow-readiness-panel" aria-label="Session workflow checklist">
      <div className="workflow-readiness-header">
        <ListChecks aria-hidden="true" size={18} />
        <div>
          <strong>Session checklist</strong>
          <span>
            {completeCount}/{steps.length} complete · informational only
          </span>
        </div>
      </div>

      <p className="workflow-readiness-notice">{WORKFLOW_READINESS_NOTICE}</p>

      <ul className="workflow-readiness-list">
        {steps.map((step) => (
          <WorkflowStepRow key={step.id} step={step} />
        ))}
      </ul>
    </section>
  );
}

function WorkflowStepRow({ step }: { step: WorkflowStepStatus }) {
  const Icon =
    step.status === "complete"
      ? CheckCircle2
      : step.status === "blocked"
        ? OctagonAlert
        : step.status === "partial"
          ? CircleDashed
          : Circle;

  return (
    <li className={`workflow-readiness-item workflow-readiness-${step.status}`}>
      <Icon aria-hidden="true" size={16} />
      <div>
        <strong>{step.label}</strong>
        <span className="workflow-readiness-status">{formatWorkflowStepStatus(step.status)}</span>
        <p>{step.detail}</p>
      </div>
    </li>
  );
}
