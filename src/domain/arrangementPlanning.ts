import {
  COMBINED_PREVIEW_DEFAULT_SECONDS,
  COMBINED_PREVIEW_MAX_SECONDS,
} from "./combinedPreview.ts";
import {
  createNeutralMixSettings,
  type MixSettings,
} from "./mixControls.ts";
import type { MashIntent, PitchTimeDirectionPlan } from "./pitchTimePlanning.ts";
import {
  buildPitchTimePlanFromArtifacts,
  type RubberBandReadiness,
} from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { BeatGridModel } from "./beatGrid.ts";
import { formatPhraseReadiness } from "./beatGrid.ts";
import type { SlotId } from "./types.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  buildMissingRequirementActions,
  type MissingRequirementAction,
} from "./arrangementSectionBinding.ts";

export type DraftType = "clean_blend" | "club_edit" | "creative_blend";

export type PhraseBasis =
  | "detected_beats"
  | "heuristic_phrase_markers"
  | "dj_override"
  | "unavailable";

export type ArrangementExportMode = "preview_copy" | "full_length" | "either";

export const ARRANGEMENT_PLANNING_ONLY_NOTICE =
  "Plan only — no audio is processed until you click preview or export.";

export const ARRANGEMENT_NO_SECTION_DETECTION_NOTICE =
  "Arrangement sections are planning templates only — not detected verse/chorus/drop labels.";

export const ARRANGEMENT_DJ_REVIEW_NOTICE = "DJ review required before live use.";

export interface ArrangementRequiredArtifacts {
  trackALoaded: boolean;
  trackBLoaded: boolean;
  trackAStemPreview: boolean;
  trackBStemPreview: boolean;
  beatAnalysisAvailable: boolean;
  phraseDataAvailable: boolean;
}

export interface ArrangementSection {
  id: string;
  label: string;
  role: "intro" | "body" | "hook" | "outro" | "transition" | "advisory";
  startTimeSeconds: number | null;
  durationBars: number | null;
  basis: PhraseBasis;
  advisoryOnly: true;
  description: string;
}

export interface DraftTemplateDefinition {
  id: DraftType;
  name: string;
  description: string;
  tagline: string;
  suggestedPreviewSeconds: number;
  suggestedExportMode: ArrangementExportMode;
  mixSettings: MixSettings;
  conservativeTempo: boolean;
  allowsAggressivePitch: boolean;
  usesIntroOutro: boolean;
  phraseLengthPreference: 8 | 16 | 32 | null;
  warnings: string[];
  limitations: string[];
}

export interface ArrangementPlanModel {
  draftType: DraftType;
  draftLabel: string;
  mashIntent: MashIntent;
  effectiveMashIntent: "vocal_a_over_beat_b" | "vocal_b_over_beat_a";
  sourceTrackLabel: string;
  targetTrackLabel: string;
  sourceTrackSlot: SlotId;
  targetTrackSlot: SlotId;
  requiredArtifacts: ArrangementRequiredArtifacts;
  tempoPlanSummary: string;
  keyPitchPlanSummary: string;
  phraseBasis: PhraseBasis;
  phraseBasisDetail: string;
  arrangementSections: ArrangementSection[];
  mixSettingsReference: MixSettings;
  suggestedPreviewSeconds: number;
  suggestedExportMode: ArrangementExportMode;
  warnings: string[];
  limitations: string[];
  missingRequirements: string[];
  missingRequirementActions: MissingRequirementAction[];
  readinessReady: boolean;
  readinessReason: string;
  djReviewRequired: true;
  planningOnly: true;
  rightsNotice: string;
}

export interface AppliedDraftSettings {
  draftType: DraftType;
  mashIntent: "vocal_a_over_beat_b" | "vocal_b_over_beat_a";
  previewDurationSeconds: number;
  mixSettings: MixSettings;
  exportMode: ArrangementExportMode;
  appliedAt: string;
}

export const DRAFT_TEMPLATE_DEFINITIONS: DraftTemplateDefinition[] = [
  {
    id: "clean_blend",
    name: "Clean Blend",
    description: "Shortest, safest structure with minimal tempo/pitch change suggestions.",
    tagline: "Clarity and low risk — conservative vocal-over-bed planning.",
    suggestedPreviewSeconds: COMBINED_PREVIEW_DEFAULT_SECONDS,
    suggestedExportMode: "preview_copy",
    mixSettings: createNeutralMixSettings(),
    conservativeTempo: true,
    allowsAggressivePitch: false,
    usesIntroOutro: false,
    phraseLengthPreference: 8,
    warnings: ["Conservative template — verify vocal level manually before export."],
    limitations: [
      "No true section detection — sections are advisory planning blocks only.",
      ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
    ],
  },
  {
    id: "club_edit",
    name: "Club Edit",
    description: "Intro/outro planning with 8/16/32-bar heuristic phrases where beats exist.",
    tagline: "DJ utility shape — longer preview/export duration when data allows.",
    suggestedPreviewSeconds: COMBINED_PREVIEW_MAX_SECONDS,
    suggestedExportMode: "full_length",
    mixSettings: {
      ...createNeutralMixSettings(),
      instrumentalGainDb: -1,
      vocalGainDb: 1,
      limiterSafety: true,
    },
    conservativeTempo: false,
    allowsAggressivePitch: false,
    usesIntroOutro: true,
    phraseLengthPreference: 16,
    warnings: [
      "Club Edit uses heuristic bar windows — not verified downbeats or song sections.",
      "Longer preview/export may increase processing time.",
    ],
    limitations: [
      "Intro/outro blocks are planning placeholders — not detected song structure.",
      ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
    ],
  },
  {
    id: "creative_blend",
    name: "Creative Blend",
    description: "More experimental pitch/time and hook-over-drop advisory language.",
    tagline: "Experimentation template — stronger DJ review warnings.",
    suggestedPreviewSeconds: 45,
    suggestedExportMode: "either",
    mixSettings: {
      ...createNeutralMixSettings(),
      vocalGainDb: 2,
      masterGainDb: -1,
      clippingGuard: true,
    },
    conservativeTempo: false,
    allowsAggressivePitch: true,
    usesIntroOutro: false,
    phraseLengthPreference: null,
    warnings: [
      "Creative Blend may suggest larger pitch/time shifts — distortion risk increases.",
      "Call-and-response / hook-over-drop language is advisory only — not detected drops.",
      ARRANGEMENT_DJ_REVIEW_NOTICE,
    ],
    limitations: [
      "No AI arrangement confidence score — all suggestions require DJ judgment.",
      ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
    ],
  },
];

export function getDraftTemplateDefinition(draftType: DraftType): DraftTemplateDefinition {
  return DRAFT_TEMPLATE_DEFINITIONS.find((item) => item.id === draftType) ?? DRAFT_TEMPLATE_DEFINITIONS[0]!;
}

export function parseDraftType(value: string): DraftType | null {
  if (value === "clean_blend" || value === "club_edit" || value === "creative_blend") {
    return value;
  }
  return null;
}

export function draftTypeFromTemplateName(name: string): DraftType {
  const normalized = name.toLowerCase().replace(/\s+/g, "_");
  if (normalized.includes("club")) {
    return "club_edit";
  }
  if (normalized.includes("creative")) {
    return "creative_blend";
  }
  return "clean_blend";
}

export function buildArrangementPlan(params: {
  artifactStore: SessionArtifactStore;
  draftType: DraftType;
  mashIntent: MashIntent;
  rubberBandStatus?: RubberBandReadiness;
  rubberBandMessage?: string;
  sidecarOnline?: boolean;
  rubberBandAvailable?: boolean;
  demucsAvailable?: boolean;
  ffmpegAvailable?: boolean;
}): ArrangementPlanModel | null {
  const trackA = params.artifactStore.tracks.trackA;
  const trackB = params.artifactStore.tracks.trackB;
  if (!trackA || !trackB) {
    return null;
  }

  const template = getDraftTemplateDefinition(params.draftType);
  const pitchPlan = buildPitchTimePlanFromArtifacts({
    artifactStore: params.artifactStore,
    intent: params.mashIntent === "compare_both" ? "vocal_a_over_beat_b" : params.mashIntent,
    rubberBandStatus: params.rubberBandStatus,
    rubberBandMessage: params.rubberBandMessage,
  });

  const effectiveIntent =
    params.mashIntent === "vocal_b_over_beat_a" ? "vocal_b_over_beat_a" : "vocal_a_over_beat_b";
  const direction =
    pitchPlan?.directions.find((item) =>
      effectiveIntent === "vocal_a_over_beat_b"
        ? item.intentLabel.includes("Vocal A")
        : item.intentLabel.includes("Vocal B")
    ) ?? pitchPlan?.directions[0];

  const sourceSlot: SlotId = effectiveIntent === "vocal_a_over_beat_b" ? "trackA" : "trackB";
  const targetSlot: SlotId = effectiveIntent === "vocal_a_over_beat_b" ? "trackB" : "trackA";
  const sourceArtifact = params.artifactStore.tracks[sourceSlot];
  const targetArtifact = params.artifactStore.tracks[targetSlot];
  const targetGrid = targetArtifact?.effectiveBeatGrid ?? null;

  const phraseBasis = resolvePhraseBasis(targetGrid, targetArtifact?.overrides ?? null);
  const sections = buildArrangementSections(template, targetGrid, direction ?? null, phraseBasis);
  const required = buildRequiredArtifacts(params.artifactStore);
  const missing = buildMissingRequirements(required, direction ?? null);
  const missingActions = buildMissingRequirementActions({
    required,
    direction: direction ?? null,
    sidecarOnline: params.sidecarOnline ?? false,
    rubberBandAvailable: params.rubberBandAvailable ?? false,
    demucsAvailable: params.demucsAvailable ?? false,
    ffmpegAvailable: params.ffmpegAvailable ?? false,
  });
  const readiness = evaluateArrangementReadiness(required, missing);

  return {
    draftType: template.id,
    draftLabel: template.name,
    mashIntent: params.mashIntent,
    effectiveMashIntent: effectiveIntent,
    sourceTrackLabel: sourceArtifact?.browserMetadata?.fileName ?? (sourceSlot === "trackA" ? "Track A" : "Track B"),
    targetTrackLabel: targetArtifact?.browserMetadata?.fileName ?? (targetSlot === "trackA" ? "Track A" : "Track B"),
    sourceTrackSlot: sourceSlot,
    targetTrackSlot: targetSlot,
    requiredArtifacts: required,
    tempoPlanSummary: direction?.tempoPlanSummary ?? "Tempo plan unavailable — add BPM overrides or enable neutral processing.",
    keyPitchPlanSummary: formatKeyPitchSummary(direction ?? null, template),
    phraseBasis,
    phraseBasisDetail: formatPhraseBasisDetail(phraseBasis, targetGrid),
    arrangementSections: sections,
    mixSettingsReference: { ...template.mixSettings },
    suggestedPreviewSeconds: template.suggestedPreviewSeconds,
    suggestedExportMode: template.suggestedExportMode,
    warnings: [...template.warnings, ...(direction?.safeRangeWarning ? [direction.safeRangeWarning] : [])],
    limitations: [
      ...template.limitations,
      ARRANGEMENT_PLANNING_ONLY_NOTICE,
      "No auto-processing — user must click preview or export explicitly.",
    ],
    missingRequirements: missing,
    missingRequirementActions: missingActions,
    readinessReady: readiness.ready,
    readinessReason: readiness.reason,
    djReviewRequired: true,
    planningOnly: true,
    rightsNotice: requiredRightsNotice,
  };
}

export function applyDraftSettingsFromPlan(plan: ArrangementPlanModel): AppliedDraftSettings {
  return {
    draftType: plan.draftType,
    mashIntent: plan.effectiveMashIntent,
    previewDurationSeconds: plan.suggestedPreviewSeconds,
    mixSettings: { ...plan.mixSettingsReference },
    exportMode: plan.suggestedExportMode,
    appliedAt: new Date().toISOString(),
  };
}

export function arrangementPlanClaimsAudioProcessed(_plan: ArrangementPlanModel): boolean {
  return false;
}

export function arrangementSectionsAvoidFakeLabels(sections: ArrangementSection[]): boolean {
  const forbidden = [/verse/i, /chorus/i, /drop detected/i, /bridge detected/i];
  return sections.every(
    (section) =>
      section.advisoryOnly &&
      !forbidden.some((pattern) => pattern.test(section.label) && !section.label.includes("advisory"))
  );
}

function buildRequiredArtifacts(store: SessionArtifactStore): ArrangementRequiredArtifacts {
  return {
    trackALoaded: Boolean(store.tracks.trackA),
    trackBLoaded: Boolean(store.tracks.trackB),
    trackAStemPreview: Boolean(store.tracks.trackA?.stemPreview?.artifactId),
    trackBStemPreview: Boolean(store.tracks.trackB?.stemPreview?.artifactId),
    beatAnalysisAvailable: Boolean(
      store.tracks.trackA?.beatAnalysis && store.tracks.trackB?.beatAnalysis
    ),
    phraseDataAvailable: Boolean(
      store.tracks.trackA?.effectiveBeatGrid?.phraseStatus === "heuristic" ||
        store.tracks.trackB?.effectiveBeatGrid?.phraseStatus === "heuristic"
    ),
  };
}

function buildMissingRequirements(
  required: ArrangementRequiredArtifacts,
  direction: PitchTimeDirectionPlan | null
): string[] {
  const missing: string[] = [];
  if (!required.trackALoaded || !required.trackBLoaded) {
    missing.push("Load both tracks.");
  }
  if (!required.trackAStemPreview || !required.trackBStemPreview) {
    missing.push("Create stem previews for both tracks before preview/export.");
  }
  if (!direction) {
    missing.push("Pitch/time direction unavailable — analyze tracks or add DJ overrides.");
  }
  if (!required.beatAnalysisAvailable) {
    missing.push("Beat analysis unavailable — phrase sections will use advisory placeholders.");
  }
  return missing;
}

function evaluateArrangementReadiness(
  required: ArrangementRequiredArtifacts,
  missing: string[]
): { ready: boolean; reason: string } {
  if (!required.trackALoaded || !required.trackBLoaded) {
    return { ready: false, reason: "Load both tracks to generate an arrangement plan." };
  }
  if (missing.some((item) => item.includes("Pitch/time"))) {
    return { ready: false, reason: "Complete analysis or overrides before applying draft settings." };
  }
  if (!required.trackAStemPreview || !required.trackBStemPreview) {
    return {
      ready: false,
      reason: "Planning available — stem previews required before preview/export handoff.",
    };
  }
  return { ready: true, reason: "Draft plan ready — apply settings then create preview or export manually." };
}

function resolvePhraseBasis(
  grid: BeatGridModel | null,
  overrides: { phraseLengthBars: number | null; alignmentOffsetSeconds: number | null } | null
): PhraseBasis {
  if (overrides?.phraseLengthBars !== null || overrides?.alignmentOffsetSeconds !== null) {
    return "dj_override";
  }

  if (!grid || grid.beatCount === 0) {
    return "unavailable";
  }

  if (grid.phraseStatus === "heuristic" && grid.phraseMarkers.length > 0) {
    return "heuristic_phrase_markers";
  }

  if (grid.beatCount > 0) {
    return "detected_beats";
  }

  return "unavailable";
}

function formatPhraseBasisDetail(basis: PhraseBasis, grid: BeatGridModel | null): string {
  switch (basis) {
    case "dj_override":
      return "Phrase windows influenced by DJ override (phrase length or alignment).";
    case "heuristic_phrase_markers":
      return grid ? formatPhraseReadiness(grid) : "Heuristic phrase markers from detected beats.";
    case "detected_beats":
      return "Detected beat times only — no verified downbeats or song sections.";
    default:
      return "Phrase basis unavailable — sections use advisory placeholders.";
  }
}

function formatKeyPitchSummary(
  direction: PitchTimeDirectionPlan | null,
  template: DraftTemplateDefinition
): string {
  if (!direction) {
    return "Key/pitch plan unavailable.";
  }

  const shift = direction.suggestedPitchShiftSemitones;
  if (shift === null) {
    return `${direction.sourceKeyLabel} → ${direction.targetKeyLabel} (pitch shift unknown).`;
  }

  if (template.conservativeTempo && Math.abs(shift) > 2) {
    return `${direction.sourceKeyLabel} → ${direction.targetKeyLabel}; suggested ${shift} st (conservative template caps advisory at ±2 st).`;
  }

  if (template.allowsAggressivePitch) {
    return `${direction.sourceKeyLabel} → ${direction.targetKeyLabel}; experimental suggestion ${shift} st — DJ review required.`;
  }

  return `${direction.sourceKeyLabel} → ${direction.targetKeyLabel}; suggested ${shift} st.`;
}

function buildArrangementSections(
  template: DraftTemplateDefinition,
  grid: BeatGridModel | null,
  direction: PitchTimeDirectionPlan | null,
  phraseBasis: PhraseBasis
): ArrangementSection[] {
  const sections: ArrangementSection[] = [];
  const phraseLength = template.phraseLengthPreference ?? grid?.phrasePlan?.phraseLengthBars ?? 8;

  if (template.usesIntroOutro) {
    sections.push({
      id: "intro-planned",
      label: "Intro (planned)",
      role: "intro",
      startTimeSeconds: grid?.phrasePlan?.phraseStartTimes[0] ?? 0,
      durationBars: phraseLength,
      basis: phraseBasis,
      advisoryOnly: true,
      description: "Heuristic intro window — not detected song intro.",
    });
  }

  if (template.id === "creative_blend") {
    sections.push({
      id: "hook-advisory",
      label: "Hook-over-drop (advisory)",
      role: "hook",
      startTimeSeconds: grid?.phrasePlan?.phraseStartTimes[1] ?? null,
      durationBars: 8,
      basis: phraseBasis,
      advisoryOnly: true,
      description: "Advisory call-and-response / hook placement language only — no drop detection.",
    });
  }

  sections.push({
    id: "mix-body",
    label: "Mix body (heuristic)",
    role: "body",
    startTimeSeconds: grid?.phrasePlan?.phraseStartTimes[0] ?? null,
    durationBars: phraseLength,
    basis: phraseBasis,
    advisoryOnly: true,
    description:
      direction?.tempoPlanSummary ??
      "Primary vocal-over-bed planning window using available tempo/key data.",
  });

  if (template.usesIntroOutro) {
    const phraseStarts = grid?.phrasePlan?.phraseStartTimes ?? [];
    const lastStart = phraseStarts.length > 0 ? phraseStarts[phraseStarts.length - 1] ?? null : null;
    sections.push({
      id: "outro-planned",
      label: "Outro (planned)",
      role: "outro",
      startTimeSeconds: lastStart,
      durationBars: phraseLength,
      basis: phraseBasis,
      advisoryOnly: true,
      description: "Heuristic outro/exit window for DJ mixing — not detected song outro.",
    });
  }

  if (sections.length === 1 && phraseBasis === "unavailable") {
    sections[0]!.description =
      "Advisory single-block plan — add beat analysis or DJ overrides for phrase-aligned sections.";
  }

  return sections;
}

export function formatArrangementSectionTimeline(sections: ArrangementSection[]): string[] {
  return sections.map((section) => {
    const start =
      section.startTimeSeconds !== null ? `${section.startTimeSeconds.toFixed(1)}s` : "time TBD";
    const bars = section.durationBars !== null ? `${section.durationBars} bars` : "bars TBD";
    return `${section.label} · ${start} · ${bars} · ${section.basis}`;
  });
}

export function formatExportModeLabel(mode: ArrangementExportMode): string {
  switch (mode) {
    case "preview_copy":
      return "Preview-length WAV copy (after combined preview)";
    case "full_length":
      return "Full-length stem re-render";
    default:
      return "Preview or full-length — user chooses at export";
  }
}

export function findArrangementSection(
  plan: ArrangementPlanModel,
  sectionId: string
): ArrangementSection | null {
  return plan.arrangementSections.find((section) => section.id === sectionId) ?? null;
}

export function resolveTargetBedBpm(
  artifactStore: SessionArtifactStore,
  plan: ArrangementPlanModel
): number | null {
  const target = artifactStore.tracks[plan.targetTrackSlot];
  return target?.overrides.bpm ?? target?.effectiveBeatGrid?.bpm ?? target?.beatAnalysis?.bpm ?? null;
}

export function arrangementAutoProcessingEnabled(): boolean {
  return false;
}
