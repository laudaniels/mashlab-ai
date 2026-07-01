import type { CombinedMashIntent, CombinedPreviewRequestParams } from "./combinedPreview.ts";
import type { MixSettings } from "./mixControls.ts";
import type { DraftType, PhraseBasis } from "./arrangementPlanning.ts";
import { ARRANGEMENT_NO_SECTION_DETECTION_NOTICE } from "./arrangementPlanning.ts";
import type { SectionPreviewBinding, PreviewStartOffsetStatus } from "./arrangementSectionBinding.ts";
import { formatPhraseBasisSourceLabel } from "./arrangementSectionBinding.ts";
import type { MashIntent, PitchTimeDirectionPlan } from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { TrackDjOverrides } from "./trackOverrides.ts";
import { emptyTrackDjOverrides } from "./trackOverrides.ts";
import { requiredRightsNotice } from "../lib/legal.ts";

export type BindingFreshnessStatus = "current" | "stale" | "partially_stale" | "unavailable";

export type ArrangementExportContextMode =
  | "preview_section"
  | "full_length_context_only"
  | "section_export";

export const ARRANGEMENT_TRACEABILITY_NOTICE =
  "Advisory arrangement section — DJ review required. Sections do not grant rights.";

export const ARRANGEMENT_SECTIONS_ADVISORY_NOTICE =
  "Arrangement sections are advisory and do not grant rights.";

export const FULL_LENGTH_ARRANGEMENT_CONTEXT_NOTICE =
  "Arrangement context only — full-length render. Use Section Window Export for advisory planning-window render.";

export interface PitchTimePlanSnapshot {
  tempoPlanSummary: string;
  keyPitchPlanSummary: string;
  sourceBpm: number | null;
  targetBpm: number | null;
  pitchShiftSemitones: number | null;
  tempoStretchRatio: number | null;
}

export interface ArrangementBindingSnapshot {
  mashIntent: CombinedMashIntent;
  mixSettings: MixSettings;
  draftType: DraftType;
  sectionId: string;
  trackAStemArtifactId: string | null;
  trackBStemArtifactId: string | null;
  trackAOverridesFingerprint: string;
  trackBOverridesFingerprint: string;
  pitchTime: PitchTimePlanSnapshot | null;
}

export interface ArrangementSectionContext {
  draftType: DraftType;
  sectionId: string;
  sectionLabel: string;
  phraseBasis: PhraseBasis;
  sourceLabel: string;
  startSeconds: number | null;
  durationSeconds: number;
  previewStartSeconds: number | null;
  startOffsetStatus: PreviewStartOffsetStatus;
  mashIntentAtBinding: CombinedMashIntent;
  mixSettingsSnapshot: MixSettings;
  pitchTimePlanSnapshot: PitchTimePlanSnapshot | null;
  bindingSnapshot: ArrangementBindingSnapshot;
  exportContextMode: ArrangementExportContextMode | null;
  createdAt: string;
  planningOnly: true;
  djReviewRequired: true;
  limitations: string[];
  rightsNotice: string;
  traceabilityNotice: string;
  phraseEvidenceMethod: string | null;
  phraseEvidenceVerified: boolean;
  phraseConfidence: number | null;
}

export interface BindingFreshnessResult {
  status: BindingFreshnessStatus;
  reasons: string[];
  summary: string;
}

export function overridesFingerprint(overrides: TrackDjOverrides): string {
  return JSON.stringify({
    bpm: overrides.bpm,
    key: overrides.key,
    mode: overrides.mode,
    camelot: overrides.camelot,
    alignmentOffsetSeconds: overrides.alignmentOffsetSeconds,
    phraseLengthBars: overrides.phraseLengthBars,
  });
}

export function mixSettingsEqual(a: MixSettings, b: MixSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildPitchTimePlanSnapshot(
  direction: PitchTimeDirectionPlan | null
): PitchTimePlanSnapshot | null {
  if (!direction) {
    return null;
  }

  return {
    tempoPlanSummary: direction.tempoPlanSummary,
    keyPitchPlanSummary: `${direction.sourceKeyLabel} → ${direction.targetKeyLabel}`,
    sourceBpm: direction.sourceBpm,
    targetBpm: direction.targetBpm,
    pitchShiftSemitones: direction.suggestedPitchShiftSemitones,
    tempoStretchRatio: direction.tempoStretchRatio,
  };
}

export function buildSectionContextFromBinding(params: {
  binding: SectionPreviewBinding;
  pitchTimePlanSnapshot: PitchTimePlanSnapshot | null;
  artifactStore: SessionArtifactStore;
  exportContextMode?: ArrangementExportContextMode | null;
}): ArrangementSectionContext {
  const { binding, pitchTimePlanSnapshot, artifactStore } = params;
  const targetSlot = binding.mashIntent === "vocal_a_over_beat_b" ? "trackB" : "trackA";
  const targetGrid = artifactStore.tracks[targetSlot]?.effectiveBeatGrid ?? null;

  const bindingSnapshot: ArrangementBindingSnapshot = {
    mashIntent: binding.mashIntent,
    mixSettings: { ...binding.mixSettings },
    draftType: binding.draftType,
    sectionId: binding.sectionId,
    trackAStemArtifactId: artifactStore.tracks.trackA?.stemPreview?.artifactId ?? null,
    trackBStemArtifactId: artifactStore.tracks.trackB?.stemPreview?.artifactId ?? null,
    trackAOverridesFingerprint: overridesFingerprint(
      artifactStore.tracks.trackA?.overrides ?? emptyTrackDjOverrides()
    ),
    trackBOverridesFingerprint: overridesFingerprint(
      artifactStore.tracks.trackB?.overrides ?? emptyTrackDjOverrides()
    ),
    pitchTime: pitchTimePlanSnapshot ? { ...pitchTimePlanSnapshot } : null,
  };

  return {
    draftType: binding.draftType,
    sectionId: binding.sectionId,
    sectionLabel: binding.sectionLabel,
    phraseBasis: binding.phraseBasis,
    sourceLabel: formatPhraseBasisSourceLabel(binding.phraseBasis),
    startSeconds: binding.previewStartSeconds,
    durationSeconds: binding.previewDurationSeconds,
    previewStartSeconds: binding.previewStartSeconds,
    startOffsetStatus: binding.startOffsetStatus,
    mashIntentAtBinding: binding.mashIntent,
    mixSettingsSnapshot: { ...binding.mixSettings },
    pitchTimePlanSnapshot: pitchTimePlanSnapshot ? { ...pitchTimePlanSnapshot } : null,
    bindingSnapshot,
    exportContextMode: params.exportContextMode ?? null,
    createdAt: new Date().toISOString(),
    planningOnly: true,
    djReviewRequired: true,
    limitations: [
      ARRANGEMENT_NO_SECTION_DETECTION_NOTICE,
      ARRANGEMENT_TRACEABILITY_NOTICE,
      ARRANGEMENT_SECTIONS_ADVISORY_NOTICE,
    ],
    rightsNotice: requiredRightsNotice,
    traceabilityNotice: ARRANGEMENT_TRACEABILITY_NOTICE,
    phraseEvidenceMethod: targetGrid?.phraseEvidenceMethod ?? null,
    phraseEvidenceVerified: targetGrid?.phraseEvidenceVerified ?? false,
    phraseConfidence: targetGrid?.phraseConfidence ?? null,
  };
}

export function serializeArrangementContextForApi(
  context: ArrangementSectionContext | null
): Record<string, unknown> | null {
  if (!context) {
    return null;
  }

  return {
    draft_type: context.draftType,
    section_id: context.sectionId,
    section_label: context.sectionLabel,
    phrase_basis: context.phraseBasis,
    source_label: context.sourceLabel,
    start_seconds: context.startSeconds,
    duration_seconds: context.durationSeconds,
    preview_start_seconds: context.previewStartSeconds,
    start_offset_status: context.startOffsetStatus,
    mash_intent_at_binding: context.mashIntentAtBinding,
    mix_settings_snapshot: context.mixSettingsSnapshot,
    pitch_time_plan_snapshot: context.pitchTimePlanSnapshot,
    export_context_mode: context.exportContextMode,
    planning_only: true,
    dj_review_required: true,
    limitations: context.limitations,
    traceability_notice: context.traceabilityNotice,
    phrase_evidence_method: context.phraseEvidenceMethod,
    phrase_evidence_verified: context.phraseEvidenceVerified,
    phrase_confidence: context.phraseConfidence,
    created_at: context.createdAt,
  };
}

export function parseArrangementContextFromMeta(raw: unknown): ArrangementSectionContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const draftType = record.draft_type;
  if (draftType !== "clean_blend" && draftType !== "club_edit" && draftType !== "creative_blend") {
    return null;
  }

  const sectionId = typeof record.section_id === "string" ? record.section_id : null;
  const sectionLabel = typeof record.section_label === "string" ? record.section_label : null;
  if (!sectionId || !sectionLabel) {
    return null;
  }

  const phraseBasis = parsePhraseBasis(record.phrase_basis);
  const mashIntent =
    record.mash_intent_at_binding === "vocal_b_over_beat_a"
      ? "vocal_b_over_beat_a"
      : "vocal_a_over_beat_b";

  const mixRaw = record.mix_settings_snapshot;
  const mixSettings = parseMixSettingsSnapshot(mixRaw);

  return {
    draftType,
    sectionId,
    sectionLabel,
    phraseBasis,
    sourceLabel:
      typeof record.source_label === "string"
        ? record.source_label
        : formatPhraseBasisSourceLabel(phraseBasis),
    startSeconds: parseNullableNumber(record.start_seconds),
    durationSeconds: parseNullableNumber(record.duration_seconds) ?? 30,
    previewStartSeconds: parseNullableNumber(record.preview_start_seconds),
    startOffsetStatus: parseStartOffsetStatus(record.start_offset_status),
    mashIntentAtBinding: mashIntent,
    mixSettingsSnapshot: mixSettings,
    pitchTimePlanSnapshot: parsePitchTimeSnapshot(record.pitch_time_plan_snapshot),
    bindingSnapshot: {
      mashIntent,
      mixSettings,
      draftType,
      sectionId,
      trackAStemArtifactId: null,
      trackBStemArtifactId: null,
      trackAOverridesFingerprint: "",
      trackBOverridesFingerprint: "",
      pitchTime: parsePitchTimeSnapshot(record.pitch_time_plan_snapshot),
    },
    exportContextMode: parseExportContextMode(record.export_context_mode),
    createdAt: typeof record.created_at === "string" ? record.created_at : new Date().toISOString(),
    planningOnly: true,
    djReviewRequired: true,
    limitations: parseStringArray(record.limitations),
    rightsNotice: requiredRightsNotice,
    traceabilityNotice:
      typeof record.traceability_notice === "string"
        ? record.traceability_notice
        : ARRANGEMENT_TRACEABILITY_NOTICE,
    phraseEvidenceMethod:
      typeof record.phrase_evidence_method === "string" ? record.phrase_evidence_method : null,
    phraseEvidenceVerified: record.phrase_evidence_verified === true,
    phraseConfidence: parseNullableNumber(record.phrase_confidence),
  };
}

export function evaluateBindingFreshness(params: {
  binding: SectionPreviewBinding | null;
  context: ArrangementSectionContext | null;
  currentMashIntent: MashIntent | CombinedMashIntent;
  currentMixSettings: MixSettings;
  currentDraftType: DraftType;
  currentSectionId: string | null;
  artifactStore: SessionArtifactStore;
  currentPitchTime: PitchTimePlanSnapshot | null;
}): BindingFreshnessResult {
  if (!params.binding || !params.context) {
    return {
      status: "unavailable",
      reasons: ["No arrangement section binding applied."],
      summary: "No section binding — apply a draft section to configure preview settings.",
    };
  }

  const reasons: string[] = [];
  const snapshot = params.context.bindingSnapshot;
  let critical = 0;
  let minor = 0;
  const currentMashIntent = resolveCombinedMashIntent(params.currentMashIntent);

  if (currentMashIntent !== snapshot.mashIntent) {
    reasons.push("Mash intent changed since binding.");
    critical += 1;
  }

  if (params.currentDraftType !== snapshot.draftType) {
    reasons.push("Draft template changed since binding.");
    critical += 1;
  }

  if (params.currentSectionId !== snapshot.sectionId) {
    reasons.push("Selected section changed since binding.");
    critical += 1;
  }

  const trackAStem = params.artifactStore.tracks.trackA?.stemPreview?.artifactId ?? null;
  const trackBStem = params.artifactStore.tracks.trackB?.stemPreview?.artifactId ?? null;
  if (trackAStem !== snapshot.trackAStemArtifactId || trackBStem !== snapshot.trackBStemArtifactId) {
    reasons.push("Stem preview artifact references changed.");
    critical += 1;
  }

  if (!mixSettingsEqual(params.currentMixSettings, snapshot.mixSettings)) {
    reasons.push("Mix settings changed since binding.");
    minor += 1;
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
    reasons.push("DJ overrides changed since binding.");
    minor += 1;
  }

  if (pitchTimeSnapshotChanged(params.currentPitchTime, snapshot.pitchTime)) {
    reasons.push("Pitch/time plan changed since binding.");
    minor += 1;
  }

  if (reasons.length === 0) {
    return { status: "current", reasons: [], summary: "Section binding matches current session state." };
  }

  if (critical > 0 && minor > 0) {
    return {
      status: "stale",
      reasons,
      summary: "Section binding is stale — re-apply draft settings before preview or export.",
    };
  }

  if (critical > 0) {
    return {
      status: "stale",
      reasons,
      summary: "Section binding is stale — re-apply draft settings before preview or export.",
    };
  }

  return {
    status: "partially_stale",
    reasons,
    summary: "Section binding partially stale — review or re-apply draft settings.",
  };
}

export function formatBindingFreshnessLabel(status: BindingFreshnessStatus): string {
  switch (status) {
    case "current":
      return "Current";
    case "stale":
      return "Stale";
    case "partially_stale":
      return "Partially stale";
    default:
      return "Unavailable";
  }
}

export function formatArrangementContextSummary(context: ArrangementSectionContext): string {
  const start =
    context.previewStartSeconds !== null && context.previewStartSeconds > 0
      ? `${context.previewStartSeconds.toFixed(1)}s start`
      : "0s start";
  return `${context.draftType.replace(/_/g, " ")} · ${context.sectionLabel} · ${context.durationSeconds}s · ${start} · ${context.phraseBasis.replace(/_/g, " ")}`;
}

export function formatArtifactArrangementTraceability(params: {
  draftType: string | null;
  sectionLabel: string | null;
  previewStartSeconds: number | null;
  durationSeconds: number | null;
  phraseBasis: string | null;
  exportContextMode: string | null;
}): string[] {
  const lines: string[] = [];
  if (params.draftType && params.sectionLabel) {
    lines.push(
      `${params.draftType.replace(/_/g, " ")} · ${params.sectionLabel} · advisory arrangement section — DJ review required`
    );
  }
  if (params.durationSeconds !== null) {
    lines.push(`Duration: ${params.durationSeconds}s`);
  }
  if (params.previewStartSeconds !== null && params.previewStartSeconds > 0) {
    lines.push(`Preview start offset: ${params.previewStartSeconds.toFixed(1)}s`);
  } else if (params.previewStartSeconds === 0) {
    lines.push("Preview start: source artifact beginning (0s)");
  }
  if (params.phraseBasis) {
    lines.push(`Phrase basis: ${params.phraseBasis.replace(/_/g, " ")}`);
  }
  if (params.exportContextMode === "full_length_context_only") {
    lines.push(FULL_LENGTH_ARRANGEMENT_CONTEXT_NOTICE);
  }
  lines.push(ARRANGEMENT_SECTIONS_ADVISORY_NOTICE);
  return lines;
}

export function attachArrangementContextToPreviewParams(
  params: CombinedPreviewRequestParams,
  context: ArrangementSectionContext | null
): CombinedPreviewRequestParams & { arrangementContext: ArrangementSectionContext | null } {
  return { ...params, arrangementContext: context };
}

export function arrangementContextClaimsFakeSections(context: ArrangementSectionContext): boolean {
  const forbidden = [/verse detected/i, /chorus detected/i, /downbeat verified/i];
  return forbidden.some((pattern) => pattern.test(context.sectionLabel));
}

function resolveCombinedMashIntent(intent: MashIntent | CombinedMashIntent): CombinedMashIntent {
  return intent === "vocal_b_over_beat_a" ? "vocal_b_over_beat_a" : "vocal_a_over_beat_b";
}

function pitchTimeSnapshotChanged(
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

function parsePhraseBasis(value: unknown): PhraseBasis {
  if (
    value === "detected_beats" ||
    value === "heuristic_phrase_markers" ||
    value === "heuristic_from_beats" ||
    value === "verified_downbeat" ||
    value === "verified_phrase" ||
    value === "dj_override" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unavailable";
}

function parseStartOffsetStatus(value: unknown): PreviewStartOffsetStatus {
  if (value === "applied" || value === "pending_unavailable" || value === "not_requested") {
    return value;
  }
  return "not_requested";
}

function parseExportContextMode(value: unknown): ArrangementExportContextMode | null {
  if (
    value === "preview_section" ||
    value === "full_length_context_only" ||
    value === "section_export"
  ) {
    return value;
  }
  return null;
}

function parseMixSettingsSnapshot(raw: unknown): MixSettings {
  if (!raw || typeof raw !== "object") {
    return emptyMixSettings();
  }
  const record = raw as Record<string, unknown>;
  return {
    vocalGainDb: numberOr(record.vocal_gain_db ?? record.vocalGainDb, 0),
    instrumentalGainDb: numberOr(record.instrumental_gain_db ?? record.instrumentalGainDb, 0),
    masterGainDb: numberOr(record.master_gain_db ?? record.masterGainDb, 0),
    vocalFadeInMs: numberOr(record.vocal_fade_in_ms ?? record.vocalFadeInMs, 0),
    vocalFadeOutMs: numberOr(record.vocal_fade_out_ms ?? record.vocalFadeOutMs, 0),
    instrumentalFadeInMs: numberOr(record.instrumental_fade_in_ms ?? record.instrumentalFadeInMs, 0),
    instrumentalFadeOutMs: numberOr(record.instrumental_fade_out_ms ?? record.instrumentalFadeOutMs, 0),
    limiterSafety: record.limiter_safety === true || record.limiterSafety === true,
    clippingGuard: record.clipping_guard === true || record.clippingGuard === true,
    instrumentalDuckUnderVocal:
      record.instrumental_duck_under_vocal === true || record.instrumentalDuckUnderVocal === true,
  };
}

function parsePitchTimeSnapshot(raw: unknown): PitchTimePlanSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  return {
    tempoPlanSummary:
      typeof record.tempo_plan_summary === "string"
        ? record.tempo_plan_summary
        : typeof record.tempoPlanSummary === "string"
          ? record.tempoPlanSummary
          : "",
    keyPitchPlanSummary:
      typeof record.key_pitch_plan_summary === "string"
        ? record.key_pitch_plan_summary
        : typeof record.keyPitchPlanSummary === "string"
          ? record.keyPitchPlanSummary
          : "",
    sourceBpm: parseNullableNumber(record.source_bpm ?? record.sourceBpm),
    targetBpm: parseNullableNumber(record.target_bpm ?? record.targetBpm),
    pitchShiftSemitones: parseNullableNumber(
      record.pitch_shift_semitones ?? record.pitchShiftSemitones
    ),
    tempoStretchRatio: parseNullableNumber(record.tempo_stretch_ratio ?? record.tempoStretchRatio),
  };
}

function emptyMixSettings(): MixSettings {
  return {
    vocalGainDb: 0,
    instrumentalGainDb: 0,
    masterGainDb: 0,
    vocalFadeInMs: 0,
    vocalFadeOutMs: 0,
    instrumentalFadeInMs: 0,
    instrumentalFadeOutMs: 0,
    limiterSafety: false,
    clippingGuard: false,
    instrumentalDuckUnderVocal: false,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
