import type { ArrangementSectionContext } from "./arrangementSectionContext.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  buildCombinedPreviewRequestParams,
  resolveCombinedPreviewDirections,
  type CombinedPreviewDirectionContext,
} from "./combinedPreview.ts";
import type { MixSettings } from "./mixControls.ts";
import { validateMixSettings } from "./mixControls.ts";
import type { MashIntent, PitchTimeDirectionPlan } from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { LoudnessReadout } from "./previewArtifacts.ts";
import type { BindingFreshnessStatus } from "./arrangementSectionContext.ts";
import type { SectionPreviewBinding } from "./arrangementSectionBinding.ts";
import type { SectionExportSettingsMode } from "./arrangementContextDiff.ts";

export const SECTION_EXPORT_SUBTYPE = "section-wav";
export const SECTION_EXPORT_FILE_NAME = "section-export.wav";

export const SECTION_EXPORT_NOTICE =
  "Section window export — advisory planning window only. Not detected song structure.";

export const SECTION_START_UNAVAILABLE_NOTICE =
  "Section start unavailable — exported from artifact start using section duration.";

export const SECTION_EXPORT_ADVISORY_COPY =
  "Exports the selected advisory planning window only. This is not detected song structure.";

export type SectionExportLoudnessMode = "measurement_only" | "normalize_section";

export interface SectionExportReadinessItem {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
}

export interface SectionExportRequestParams {
  sourceVocalStemArtifactId: string;
  targetInstrumentalStemArtifactId: string;
  mashIntent: string;
  tempoRatio: number | null;
  instrumentalTempoRatio: number | null;
  sourceBpm: number | null;
  targetBpm: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  startSeconds: number;
  durationSeconds: number;
  startSecondsUnavailable: boolean;
  confirmAdvisorySectionExport: boolean;
  confirmStartFromArtifactBeginning: boolean;
  confirmStaleContext: boolean;
  exportLabel?: string | null;
  loudnessTargetMode: SectionExportLoudnessMode;
  neutralProcessing: boolean;
  confirmNeutralSettings: boolean;
  mixSettings: MixSettings;
  arrangementContext: ArrangementSectionContext;
  bindingFreshnessStatus: BindingFreshnessStatus;
  settingsMode: SectionExportSettingsMode;
}

export interface SectionExportInputSummary {
  mashIntent: string;
  sourceVocalStemArtifactId: string;
  targetInstrumentalStemArtifactId: string;
  startSeconds: number;
  durationSeconds: number;
  startSecondsUnavailable: boolean;
  tempoRatio: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  mixSettings: MixSettings | null;
  bindingFreshnessStatus: BindingFreshnessStatus;
  settingsMode: SectionExportSettingsMode;
}

export interface SectionExportProcessingSummary {
  method: string;
  sectionTrimmed: true;
  startSecondsUsed: number;
  durationSecondsUsed: number;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  mixSettings: MixSettings | null;
  limiterSafetyApplied: boolean;
  clippingGuardApplied: boolean;
}

export interface SectionExportResult {
  ok: boolean;
  status: string;
  message: string;
  exportArtifactId: string | null;
  artifactUrl: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  inputSummary: SectionExportInputSummary | null;
  processingSummary: SectionExportProcessingSummary | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  codec: string | null;
  loudness: LoudnessReadout | null;
  finalExport: boolean;
  publicShare: boolean;
  sectionTrimmedExport: boolean;
  rightsNotice: string;
  warnings: string[];
  limitations: string[];
  exportLabel: string | null;
  validationErrors: string[] | null;
  setupGuidance: string | null;
}

export const DEFAULT_SECTION_EXPORT_RIGHTS_NOTICE = requiredRightsNotice;

export function resolveSectionExportContext(
  artifactStore: SessionArtifactStore,
  mashIntent: MashIntent,
  directions: PitchTimeDirectionPlan[]
): CombinedPreviewDirectionContext | null {
  const resolved = resolveCombinedPreviewDirections(artifactStore, mashIntent, directions);
  return resolved[0] ?? null;
}

export function buildSectionExportRequestParams(params: {
  context: CombinedPreviewDirectionContext;
  binding: SectionPreviewBinding;
  sectionContext: ArrangementSectionContext;
  mixSettings: MixSettings;
  settingsMode: SectionExportSettingsMode;
  bindingFreshnessStatus: BindingFreshnessStatus;
  startSeconds: number;
  startSecondsUnavailable: boolean;
  confirmAdvisorySectionExport: boolean;
  confirmStartFromArtifactBeginning: boolean;
  confirmStaleContext: boolean;
  loudnessTargetMode: SectionExportLoudnessMode;
  neutralProcessing: boolean;
  confirmNeutralSettings: boolean;
  exportLabel?: string | null;
}): SectionExportRequestParams {
  const previewParams = buildCombinedPreviewRequestParams(
    params.context,
    params.neutralProcessing,
    params.binding.previewDurationSeconds,
    params.mixSettings,
    params.startSeconds
  );

  if (params.settingsMode === "bound") {
    const boundPitch = params.sectionContext.bindingSnapshot.pitchTime;
    if (boundPitch && !params.neutralProcessing) {
      previewParams.tempoRatio = boundPitch.tempoStretchRatio;
      previewParams.sourceBpm = boundPitch.sourceBpm;
      previewParams.targetBpm = boundPitch.targetBpm;
      previewParams.pitchShiftSemitones = boundPitch.pitchShiftSemitones ?? 0;
    }
    previewParams.mashIntent = params.sectionContext.bindingSnapshot.mashIntent;
  }

  return {
    sourceVocalStemArtifactId: previewParams.sourceVocalArtifactId,
    targetInstrumentalStemArtifactId: previewParams.targetInstrumentalArtifactId,
    mashIntent: previewParams.mashIntent,
    tempoRatio: previewParams.tempoRatio,
    instrumentalTempoRatio: previewParams.instrumentalTempoRatio,
    sourceBpm: previewParams.sourceBpm,
    targetBpm: previewParams.targetBpm,
    pitchShiftSemitones: previewParams.pitchShiftSemitones,
    alignmentOffsetMs: previewParams.alignmentOffsetMs,
    startSeconds: params.startSeconds,
    durationSeconds: params.binding.previewDurationSeconds,
    startSecondsUnavailable: params.startSecondsUnavailable,
    confirmAdvisorySectionExport: params.confirmAdvisorySectionExport,
    confirmStartFromArtifactBeginning: params.confirmStartFromArtifactBeginning,
    confirmStaleContext: params.confirmStaleContext,
    exportLabel: params.exportLabel ?? null,
    loudnessTargetMode: params.loudnessTargetMode,
    neutralProcessing: params.neutralProcessing,
    confirmNeutralSettings: params.confirmNeutralSettings,
    mixSettings: params.mixSettings,
    arrangementContext: {
      ...params.sectionContext,
      exportContextMode: "section_export",
    },
    bindingFreshnessStatus: params.bindingFreshnessStatus,
    settingsMode: params.settingsMode,
  };
}

export function buildSectionExportReadiness(params: {
  artifactStore: SessionArtifactStore;
  context: CombinedPreviewDirectionContext | null;
  binding: SectionPreviewBinding | null;
  sectionContext: ArrangementSectionContext | null;
  sidecarOnline: boolean;
  rubberBandAvailable: boolean;
  ffmpegAvailable: boolean;
  rightsAcknowledged: boolean;
  confirmAdvisorySectionExport: boolean;
  confirmStartFromArtifactBeginning: boolean;
  startSecondsUnavailable: boolean;
  requiresStaleConfirmation: boolean;
  confirmStaleContext: boolean;
  durationSeconds: number | null;
}): SectionExportReadinessItem[] {
  const trackAStem = params.artifactStore.tracks.trackA?.stemPreview?.artifactId ?? null;
  const trackBStem = params.artifactStore.tracks.trackB?.stemPreview?.artifactId ?? null;

  return [
    {
      id: "section_binding",
      label: "Section binding",
      ready: Boolean(params.binding && params.sectionContext),
      detail: params.binding
        ? `Bound: ${params.binding.sectionLabel}`
        : "Apply a section on Drafts first.",
    },
    {
      id: "stems",
      label: "Stem previews",
      ready: Boolean(trackAStem && trackBStem),
      detail:
        trackAStem && trackBStem
          ? "Vocal and instrumental stem artifacts available."
          : "Create stem previews for both tracks.",
    },
    {
      id: "rubber_band",
      label: "Rubber Band",
      ready: params.rubberBandAvailable,
      detail: params.rubberBandAvailable
        ? "Rubber Band CLI available."
        : "Install Rubber Band for vocal pitch/time processing.",
    },
    {
      id: "ffmpeg",
      label: "FFmpeg",
      ready: params.ffmpegAvailable,
      detail: params.ffmpegAvailable ? "FFmpeg available." : "Install FFmpeg for trim and mix.",
    },
    {
      id: "duration",
      label: "Section duration",
      ready: params.durationSeconds !== null && params.durationSeconds > 0,
      detail:
        params.durationSeconds && params.durationSeconds > 0
          ? `${params.durationSeconds}s planning window.`
          : "Section duration unavailable — cannot export.",
    },
    {
      id: "sidecar",
      label: "Local sidecar",
      ready: params.sidecarOnline,
      detail: params.sidecarOnline ? "Sidecar online." : "Start the local sidecar.",
    },
    {
      id: "rights",
      label: "Rights acknowledgment",
      ready: params.rightsAcknowledged,
      detail: params.rightsAcknowledged
        ? "Rights acknowledged."
        : "Confirm you own or are authorized to use source audio.",
    },
    {
      id: "advisory_confirm",
      label: "Advisory section confirmation",
      ready: params.confirmAdvisorySectionExport,
      detail: params.confirmAdvisorySectionExport
        ? "Advisory planning-window export confirmed."
        : "Confirm this exports an advisory planning window only.",
    },
    {
      id: "start_confirm",
      label: "Start offset confirmation",
      ready: !params.startSecondsUnavailable || params.confirmStartFromArtifactBeginning,
      detail: params.startSecondsUnavailable
        ? params.confirmStartFromArtifactBeginning
          ? "Start from artifact beginning confirmed."
          : "Section start unavailable — confirm export from artifact start."
        : "Section start seconds available.",
    },
    {
      id: "stale_confirm",
      label: "Stale context confirmation",
      ready: !params.requiresStaleConfirmation || params.confirmStaleContext,
      detail: params.requiresStaleConfirmation
        ? params.confirmStaleContext
          ? "Stale context export confirmed."
          : "Context differs from binding — confirm before export."
        : "Context matches binding or partially stale with chosen settings.",
    },
  ];
}

export function isSectionExportReady(items: SectionExportReadinessItem[]): boolean {
  return items.every((item) => item.ready);
}

export function formatSectionExportReadinessChecklist(items: SectionExportReadinessItem[]): string[] {
  return items.map((item) => `${item.ready ? "✓" : "○"} ${item.label} — ${item.detail}`);
}

export function sectionExportLoudnessModeLabel(mode: SectionExportLoudnessMode): string {
  if (mode === "normalize_section") {
    return "Normalize section (prototype — planning window only)";
  }
  return "Measurement only (default)";
}

export function isSectionExportArtifact(artifact: {
  artifactType: string;
  exportSubtype: string | null;
  sectionTrimmedExport?: boolean;
  primaryFileName?: string;
}): boolean {
  return (
    artifact.artifactType === "export" &&
    (artifact.exportSubtype === SECTION_EXPORT_SUBTYPE ||
      artifact.sectionTrimmedExport === true ||
      artifact.primaryFileName === SECTION_EXPORT_FILE_NAME)
  );
}

export function validateSectionExportRequest(params: SectionExportRequestParams): string[] {
  const errors: string[] = [];

  if (!/^[a-zA-Z0-9]+$/.test(params.sourceVocalStemArtifactId)) {
    errors.push("source_vocal_stem_artifact_id must be alphanumeric.");
  }
  if (!/^[a-zA-Z0-9]+$/.test(params.targetInstrumentalStemArtifactId)) {
    errors.push("target_instrumental_stem_artifact_id must be alphanumeric.");
  }
  if (params.durationSeconds <= 0) {
    errors.push("duration_seconds must be greater than zero.");
  }
  if (params.startSeconds < 0) {
    errors.push("start_seconds must be zero or greater.");
  }
  if (!params.confirmAdvisorySectionExport) {
    errors.push("confirm_advisory_section_export must be true.");
  }
  if (params.startSecondsUnavailable && !params.confirmStartFromArtifactBeginning) {
    errors.push(
      "confirm_start_from_artifact_beginning must be true when section start is unavailable."
    );
  }
  if (
    (params.bindingFreshnessStatus === "stale" ||
      params.bindingFreshnessStatus === "partially_stale") &&
    !params.confirmStaleContext
  ) {
    errors.push("confirm_stale_context must be true when binding context is stale.");
  }
  if (
    params.loudnessTargetMode !== "measurement_only" &&
    params.loudnessTargetMode !== "normalize_section"
  ) {
    errors.push("loudness_target_mode must be measurement_only or normalize_section.");
  }
  if (params.exportLabel && params.exportLabel.trim().length > 120) {
    errors.push("export_label must be 120 characters or fewer.");
  }
  errors.push(...validateMixSettings(params.mixSettings));

  return errors;
}

export function sectionExportResultClaimsPublicShare(result: SectionExportResult): boolean {
  return result.publicShare === true;
}

export function formatSectionExportArtifactSummary(params: {
  draftType: string | null;
  sectionLabel: string | null;
  startSeconds: number | null;
  durationSeconds: number | null;
  phraseBasis: string | null;
  bindingFreshnessStatus: string | null;
}): string[] {
  const lines: string[] = [];
  if (params.draftType && params.sectionLabel) {
    lines.push(
      `Section window · ${params.draftType.replace(/_/g, " ")} · ${params.sectionLabel} · advisory planning window`
    );
  }
  if (params.durationSeconds !== null) {
    lines.push(`Duration: ${params.durationSeconds}s`);
  }
  if (params.startSeconds !== null && params.startSeconds > 0) {
    lines.push(`Start offset: ${params.startSeconds.toFixed(1)}s`);
  } else if (params.startSeconds === 0) {
    lines.push("Start: artifact beginning (0s)");
  }
  if (params.phraseBasis) {
    lines.push(`Phrase basis: ${params.phraseBasis.replace(/_/g, " ")}`);
  }
  if (params.bindingFreshnessStatus) {
    lines.push(`Context at export: ${params.bindingFreshnessStatus.replace(/_/g, " ")}`);
  }
  lines.push(SECTION_EXPORT_ADVISORY_COPY);
  lines.push("Arrangement sections are advisory and do not grant rights.");
  return lines;
}
