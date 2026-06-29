import type { MixSettings } from "./mixControls.ts";
import { formatMixSettingsSummary } from "./mixControls.ts";
import type { DraftType } from "./arrangementPlanning.ts";
import type { CombinedMashIntent } from "./combinedPreview.ts";
import {
  evaluateBindingFreshness,
  formatBindingFreshnessLabel,
  mixSettingsEqual,
  overridesFingerprint,
  type ArrangementSectionContext,
  type BindingFreshnessStatus,
  type PitchTimePlanSnapshot,
} from "./arrangementSectionContext.ts";
import type { SectionPreviewBinding } from "./arrangementSectionBinding.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import { emptyTrackDjOverrides } from "./trackOverrides.ts";

export type ContextDiffRecommendedAction =
  | "re_apply_section"
  | "proceed_bound"
  | "proceed_current"
  | "cancel";

export type SectionExportSettingsMode = "bound" | "current";

export interface ContextDiffField {
  field: string;
  boundValue: string;
  currentValue: string;
}

export interface ArrangementContextDiffResult {
  status: BindingFreshnessStatus;
  summary: string;
  fields: ContextDiffField[];
  recommendedActions: ContextDiffRecommendedAction[];
  requiresStaleConfirmation: boolean;
}

export function buildArrangementContextDiff(params: {
  binding: SectionPreviewBinding | null;
  context: ArrangementSectionContext | null;
  currentMashIntent: CombinedMashIntent | import("./pitchTimePlanning.ts").MashIntent;
  currentMixSettings: MixSettings;
  currentDraftType: DraftType;
  currentSectionId: string | null;
  artifactStore: SessionArtifactStore;
  currentPitchTime: PitchTimePlanSnapshot | null;
}): ArrangementContextDiffResult {
  const freshness = evaluateBindingFreshness(params);
  const fields: ContextDiffField[] = [];

  if (!params.binding || !params.context) {
    return {
      status: "unavailable",
      summary: "No section binding — apply a draft section on Drafts first.",
      fields: [],
      recommendedActions: ["re_apply_section", "cancel"],
      requiresStaleConfirmation: false,
    };
  }

  const snapshot = params.context.bindingSnapshot;

  if (params.currentMashIntent !== snapshot.mashIntent) {
    fields.push({
      field: "Mash intent",
      boundValue: formatMashIntent(snapshot.mashIntent),
      currentValue: formatMashIntent(params.currentMashIntent),
    });
  }

  if (params.currentDraftType !== snapshot.draftType) {
    fields.push({
      field: "Draft template",
      boundValue: snapshot.draftType.replace(/_/g, " "),
      currentValue: params.currentDraftType.replace(/_/g, " "),
    });
  }

  if (params.currentSectionId !== snapshot.sectionId) {
    fields.push({
      field: "Selected section",
      boundValue: params.context.sectionLabel,
      currentValue: params.currentSectionId ?? "none",
    });
  }

  const trackAStem = params.artifactStore.tracks.trackA?.stemPreview?.artifactId ?? null;
  const trackBStem = params.artifactStore.tracks.trackB?.stemPreview?.artifactId ?? null;
  if (
    trackAStem !== snapshot.trackAStemArtifactId ||
    trackBStem !== snapshot.trackBStemArtifactId
  ) {
    fields.push({
      field: "Stem artifact references",
      boundValue: `${snapshot.trackAStemArtifactId ?? "—"} / ${snapshot.trackBStemArtifactId ?? "—"}`,
      currentValue: `${trackAStem ?? "—"} / ${trackBStem ?? "—"}`,
    });
  }

  if (!mixSettingsEqual(params.currentMixSettings, snapshot.mixSettings)) {
    fields.push({
      field: "Mix settings",
      boundValue: formatMixSettingsSummary(snapshot.mixSettings),
      currentValue: formatMixSettingsSummary(params.currentMixSettings),
    });
  }

  const trackAFp = overridesFingerprint(
    params.artifactStore.tracks.trackA?.overrides ?? emptyTrackDjOverrides()
  );
  const trackBFp = overridesFingerprint(
    params.artifactStore.tracks.trackB?.overrides ?? emptyTrackDjOverrides()
  );
  if (
    trackAFp !== snapshot.trackAOverridesFingerprint ||
    trackBFp !== snapshot.trackBOverridesFingerprint
  ) {
    fields.push({
      field: "DJ overrides",
      boundValue: "Bound session snapshot",
      currentValue: "Current session overrides",
    });
  }

  if (pitchTimeChanged(params.currentPitchTime, snapshot.pitchTime)) {
    fields.push({
      field: "Pitch/time plan",
      boundValue: formatPitchTime(snapshot.pitchTime),
      currentValue: formatPitchTime(params.currentPitchTime),
    });
  }

  const recommendedActions = buildRecommendedActions(freshness.status, fields.length > 0);

  return {
    status: freshness.status,
    summary: freshness.summary,
    fields,
    recommendedActions,
    requiresStaleConfirmation:
      freshness.status === "stale" || freshness.status === "partially_stale",
  };
}

export function formatContextDiffSummary(diff: ArrangementContextDiffResult): string[] {
  const lines: string[] = [
    `Context status: ${formatBindingFreshnessLabel(diff.status)} — ${diff.summary}`,
  ];
  for (const field of diff.fields) {
    lines.push(`${field.field}: bound ${field.boundValue} · current ${field.currentValue}`);
  }
  return lines;
}

export function resolveSectionExportMixSettings(params: {
  mode: SectionExportSettingsMode;
  binding: SectionPreviewBinding;
  currentMixSettings: MixSettings;
}): MixSettings {
  return params.mode === "bound" ? { ...params.binding.mixSettings } : { ...params.currentMixSettings };
}

function buildRecommendedActions(
  status: BindingFreshnessStatus,
  hasFieldDiffs: boolean
): ContextDiffRecommendedAction[] {
  if (status === "unavailable") {
    return ["re_apply_section", "cancel"];
  }
  if (status === "current" && !hasFieldDiffs) {
    return ["proceed_bound", "proceed_current", "cancel"];
  }
  if (status === "partially_stale") {
    return ["re_apply_section", "proceed_bound", "proceed_current", "cancel"];
  }
  return ["re_apply_section", "proceed_bound", "cancel"];
}

function formatMashIntent(intent: string): string {
  return intent === "vocal_b_over_beat_a" ? "Vocal B over Beat A" : "Vocal A over Beat B";
}

function formatPitchTime(snapshot: PitchTimePlanSnapshot | null): string {
  if (!snapshot) {
    return "not available";
  }
  return `${snapshot.tempoPlanSummary} · ${snapshot.keyPitchPlanSummary}`;
}

function pitchTimeChanged(
  current: PitchTimePlanSnapshot | null,
  bound: PitchTimePlanSnapshot | null
): boolean {
  if (!current && !bound) {
    return false;
  }
  if (!current || !bound) {
    return true;
  }
  return (
    current.tempoStretchRatio !== bound.tempoStretchRatio ||
    current.pitchShiftSemitones !== bound.pitchShiftSemitones ||
    current.sourceBpm !== bound.sourceBpm ||
    current.targetBpm !== bound.targetBpm
  );
}
