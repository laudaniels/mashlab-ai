import {
  COMBINED_PREVIEW_MAX_SECONDS,
  type CombinedPreviewRequestParams,
} from "./combinedPreview.ts";
import type { MixSettings } from "./mixControls.ts";
import type { PhraseBasis, ArrangementPlanModel, ArrangementSection, DraftType } from "./arrangementPlanning.ts";
import {
  ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
  ARRANGEMENT_PLANNING_ONLY_NOTICE,
} from "./arrangementPlanning.ts";
import type { ArrangementRequiredArtifacts } from "./arrangementPlanning.ts";
import type { PitchTimeDirectionPlan } from "./pitchTimePlanning.ts";
import type { WorkflowScreen } from "./types.ts";
import { requiredRightsNotice } from "../lib/legal.ts";

export type AppScreenId = WorkflowScreen["id"];

export type MissingRequirementId =
  | "tracks_not_loaded"
  | "stem_previews_missing"
  | "pitch_time_unavailable"
  | "beat_analysis_unavailable"
  | "sidecar_offline"
  | "rubber_band_missing"
  | "demucs_missing"
  | "ffmpeg_missing";

export interface MissingRequirementAction {
  id: MissingRequirementId;
  label: string;
  requiredAction: string;
  targetScreen: AppScreenId;
  dependencyHint: string | null;
}

export interface SelectedArrangementSection {
  draftType: DraftType;
  sectionId: string;
  sectionLabel: string;
  startTimeSeconds: number | null;
  durationBars: number | null;
  durationSeconds: number | null;
  phraseBasis: PhraseBasis;
  sourceLabel: string;
  limitations: string[];
  selectedAt: string;
}

export type PreviewStartOffsetStatus = "applied" | "pending_unavailable" | "not_requested";

export interface SectionPreviewBinding {
  draftType: DraftType;
  sectionId: string;
  sectionLabel: string;
  mashIntent: "vocal_a_over_beat_b" | "vocal_b_over_beat_a";
  previewDurationSeconds: number;
  previewStartSeconds: number | null;
  startOffsetStatus: PreviewStartOffsetStatus;
  mixSettings: MixSettings;
  phraseBasis: PhraseBasis;
  limitations: string[];
  rightsNotice: string;
  boundAt: string;
  planningOnly: true;
}

export const ARRANGEMENT_SECTION_BINDING_NOTICE =
  "This configures the preview. It does not process audio.";

export const PREVIEW_START_OFFSET_PENDING_NOTICE =
  "Section start is planned but current preview begins at the source artifact start.";

export function formatPhraseBasisSourceLabel(basis: PhraseBasis): string {
  switch (basis) {
    case "detected_beats":
      return "detected beats (no verified downbeats)";
    case "heuristic_phrase_markers":
      return "heuristic phrase markers";
    case "dj_override":
      return "DJ override";
    default:
      return "unavailable";
  }
}

export function computeSectionDurationSeconds(
  section: ArrangementSection,
  bpm: number | null,
  maxSeconds: number = COMBINED_PREVIEW_MAX_SECONDS
): number | null {
  if (section.durationBars === null || bpm === null || !Number.isFinite(bpm) || bpm <= 0) {
    return null;
  }

  const seconds = (section.durationBars * 4 * 60) / bpm;
  return Math.min(maxSeconds, Math.max(1, Math.round(seconds)));
}

export function selectArrangementSection(
  plan: ArrangementPlanModel,
  section: ArrangementSection,
  targetBpm: number | null
): SelectedArrangementSection {
  return {
    draftType: plan.draftType,
    sectionId: section.id,
    sectionLabel: section.label,
    startTimeSeconds: section.startTimeSeconds,
    durationBars: section.durationBars,
    durationSeconds: computeSectionDurationSeconds(section, targetBpm),
    phraseBasis: section.basis,
    sourceLabel: formatPhraseBasisSourceLabel(section.basis),
    limitations: [
      ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
      "Section selection is planning/config only — no audio processing.",
    ],
    selectedAt: new Date().toISOString(),
  };
}

export function resolvePreviewStartOffset(
  startTimeSeconds: number | null
): { previewStartSeconds: number | null; startOffsetStatus: PreviewStartOffsetStatus } {
  if (startTimeSeconds === null || !Number.isFinite(startTimeSeconds)) {
    return { previewStartSeconds: null, startOffsetStatus: "pending_unavailable" };
  }

  if (startTimeSeconds <= 0) {
    return { previewStartSeconds: 0, startOffsetStatus: "applied" };
  }

  return { previewStartSeconds: startTimeSeconds, startOffsetStatus: "applied" };
}

export function bindSectionToPreviewSettings(
  plan: ArrangementPlanModel,
  section: ArrangementSection,
  targetBpm: number | null
): SectionPreviewBinding {
  const durationFromBars = computeSectionDurationSeconds(section, targetBpm);
  const previewDurationSeconds = Math.min(
    COMBINED_PREVIEW_MAX_SECONDS,
    Math.max(1, durationFromBars ?? plan.suggestedPreviewSeconds)
  );
  const { previewStartSeconds, startOffsetStatus } = resolvePreviewStartOffset(section.startTimeSeconds);

  const limitations = [
    ARRANGEMENT_SECTION_BINDING_NOTICE,
    ARRANGEMENT_PLANNING_ONLY_NOTICE,
    ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
  ];

  if (startOffsetStatus === "pending_unavailable") {
    limitations.push(PREVIEW_START_OFFSET_PENDING_NOTICE);
  }

  return {
    draftType: plan.draftType,
    sectionId: section.id,
    sectionLabel: section.label,
    mashIntent: plan.effectiveMashIntent,
    previewDurationSeconds,
    previewStartSeconds,
    startOffsetStatus,
    mixSettings: { ...plan.mixSettingsReference },
    phraseBasis: section.basis,
    limitations,
    rightsNotice: requiredRightsNotice,
    boundAt: new Date().toISOString(),
    planningOnly: true,
  };
}

export function sectionBindingClaimsOffsetApplied(binding: SectionPreviewBinding): boolean {
  return (
    binding.startOffsetStatus === "applied" &&
    binding.previewStartSeconds !== null &&
    binding.previewStartSeconds > 0
  );
}

export function formatSectionBindingSummary(binding: SectionPreviewBinding): string {
  const startLine =
    binding.startOffsetStatus === "applied" && binding.previewStartSeconds !== null
      ? binding.previewStartSeconds > 0
        ? `Start offset ${binding.previewStartSeconds.toFixed(1)}s (will be sent to sidecar when preview is created).`
        : "Start at source artifact beginning (0s)."
      : PREVIEW_START_OFFSET_PENDING_NOTICE;

  return `${binding.sectionLabel} · ${binding.previewDurationSeconds}s · ${startLine}`;
}

export function applySectionBindingToPreviewParams(
  params: CombinedPreviewRequestParams,
  binding: SectionPreviewBinding
): CombinedPreviewRequestParams {
  return {
    ...params,
    maxPreviewSeconds: binding.previewDurationSeconds,
    previewStartSeconds:
      binding.startOffsetStatus === "applied" ? (binding.previewStartSeconds ?? 0) : 0,
    mixSettings: { ...binding.mixSettings },
  };
}

export function sectionBindingAutoProcessingEnabled(): boolean {
  return false;
}

export function buildMissingRequirementActions(params: {
  required: ArrangementRequiredArtifacts;
  direction: PitchTimeDirectionPlan | null;
  sidecarOnline: boolean;
  rubberBandAvailable: boolean;
  demucsAvailable: boolean;
  ffmpegAvailable: boolean;
}): MissingRequirementAction[] {
  const actions: MissingRequirementAction[] = [];

  if (!params.required.trackALoaded || !params.required.trackBLoaded) {
    actions.push({
      id: "tracks_not_loaded",
      label: "Load both tracks",
      requiredAction: "Upload Track A and Track B with local audio files.",
      targetScreen: "upload",
      dependencyHint: null,
    });
  }

  if (!params.sidecarOnline) {
    actions.push({
      id: "sidecar_offline",
      label: "Start local sidecar",
      requiredAction: "Run the Python helper service on localhost for analysis and preview processing.",
      targetScreen: "analysis",
      dependencyHint: "See docs/LOCAL_ENGINE_SERVICE.md — uvicorn on 127.0.0.1:47831",
    });
  } else {
    if (!params.ffmpegAvailable) {
      actions.push({
        id: "ffmpeg_missing",
        label: "Install FFmpeg",
        requiredAction: "Add FFmpeg and ffprobe to PATH for mix and export lanes.",
        targetScreen: "analysis",
        dependencyHint: "Run npm run check:local-engine after installing FFmpeg.",
      });
    }
    if (!params.rubberBandAvailable) {
      actions.push({
        id: "rubber_band_missing",
        label: "Install Rubber Band CLI",
        requiredAction: "Add rubberband to PATH for pitch/time and combined preview.",
        targetScreen: "analysis",
        dependencyHint: null,
      });
    }
    if (!params.demucsAvailable) {
      actions.push({
        id: "demucs_missing",
        label: "Configure Demucs",
        requiredAction: "Install torch and demucs in the sidecar venv for stem previews.",
        targetScreen: "stems",
        dependencyHint: "pip install torch demucs",
      });
    }
  }

  if (!params.required.beatAnalysisAvailable) {
    actions.push({
      id: "beat_analysis_unavailable",
      label: "Run beat analysis",
      requiredAction: "Analyze both tracks when librosa is available, or add DJ BPM overrides.",
      targetScreen: "analysis",
      dependencyHint: "Phrase sections use advisory placeholders without beat data.",
    });
  }

  if (!params.direction) {
    actions.push({
      id: "pitch_time_unavailable",
      label: "Complete pitch/time plan",
      requiredAction: "Run BPM/key analysis or set DJ overrides on the Timeline screen.",
      targetScreen: "timeline",
      dependencyHint: null,
    });
  }

  if (!params.required.trackAStemPreview || !params.required.trackBStemPreview) {
    actions.push({
      id: "stem_previews_missing",
      label: "Create stem previews",
      requiredAction: "Run Demucs stem separation for both tracks before combined preview.",
      targetScreen: "stems",
      dependencyHint: null,
    });
  }

  return actions;
}

export function missingRequirementActionLabels(actions: MissingRequirementAction[]): string[] {
  return actions.map((action) => `${action.label}: ${action.requiredAction}`);
}

export function findMissingRequirementAction(
  actions: MissingRequirementAction[],
  id: MissingRequirementId
): MissingRequirementAction | undefined {
  return actions.find((action) => action.id === id);
}
