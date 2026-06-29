import { requiredRightsNotice } from "../lib/legal.ts";
import {
  buildCombinedPreviewRequestParams,
  isCombinedPreviewReady,
  resolveCombinedPreviewDirections,
  type CombinedPreviewDirectionContext,
} from "./combinedPreview.ts";
import type { MashIntent, PitchTimeDirectionPlan, RubberBandReadiness } from "./pitchTimePlanning.ts";
import { buildPitchTimePlanFromArtifacts } from "./pitchTimePlanning.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import type { SlotId } from "./types.ts";
import type { LoudnessReadout } from "./previewArtifacts.ts";

export const FULL_EXPORT_SUBTYPE = "full-wav";
export const PREVIEW_COPY_EXPORT_SUBTYPE = "preview-copy";

export const FULL_LENGTH_EXPORT_NOTICE =
  "Full-length local WAV export from stem artifacts — not a published release or club master.";

export const FULL_LENGTH_PROCESSING_WARNING =
  "Full-length rendering may take significantly longer than preview lanes.";

export type FullLengthLoudnessMode =
  | "measurement_only"
  | "normalize_preview_copy"
  | "normalize_export";

export interface FullLengthExportReadinessItem {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
}

export interface FullLengthExportRequestParams {
  sourceVocalStemArtifactId: string;
  targetInstrumentalStemArtifactId: string;
  mashIntent: string;
  tempoRatio: number | null;
  sourceBpm: number | null;
  targetBpm: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  exportLabel?: string | null;
  loudnessTargetMode: FullLengthLoudnessMode;
  neutralProcessing: boolean;
  confirmNeutralSettings: boolean;
}

export interface LoudnessGateDisplay {
  status: "pass" | "warn" | "not_available";
  message: string;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  targetIntegratedLufs: number;
  targetTruePeakDbtp: number;
}

export interface FullLengthExportProcessingSummary {
  method: string;
  vocalRubberbandRatio: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  fullLength: boolean;
  maxTestSeconds: number | null;
}

export interface FullLengthExportInputSummary {
  mashIntent: string;
  sourceVocalStemArtifactId: string;
  targetInstrumentalStemArtifactId: string;
  tempoRatio: number | null;
  pitchShiftSemitones: number;
  alignmentOffsetMs: number;
  neutralProcessing: boolean;
}

export interface FullLengthExportResult {
  ok: boolean;
  status: string;
  message: string;
  exportArtifactId: string | null;
  artifactUrl: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  inputSummary: FullLengthExportInputSummary | null;
  processingSummary: FullLengthExportProcessingSummary | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  codec: string | null;
  loudness: LoudnessReadout | null;
  loudnessGate: LoudnessGateDisplay | null;
  finalExport: boolean;
  publicShare: boolean;
  rightsNotice: string;
  warnings: string[];
  limitations: string[];
  exportLabel: string | null;
  validationErrors: string[] | null;
  setupGuidance: string | null;
}

export const GENERAL_LOUDNESS_TARGET_LUFS = -14;
export const GENERAL_TRUE_PEAK_TARGET_DBTP = -1;

export function stemArtifactAvailable(
  artifactStore: SessionArtifactStore,
  slotId: SlotId
): boolean {
  return Boolean(artifactStore.tracks[slotId]?.stemPreview?.artifactId);
}

export function resolveFullLengthExportContext(
  artifactStore: SessionArtifactStore,
  intent: MashIntent,
  directions: PitchTimeDirectionPlan[]
): CombinedPreviewDirectionContext | null {
  const contexts = resolveCombinedPreviewDirections(artifactStore, intent, directions);
  return contexts[0] ?? null;
}

export function buildFullLengthExportReadiness(params: {
  artifactStore: SessionArtifactStore;
  context: CombinedPreviewDirectionContext | null;
  sidecarOnline: boolean;
  rubberBandAvailable: boolean;
  ffmpegAvailable: boolean;
  useNeutralProcessing: boolean;
  confirmNeutralSettings: boolean;
  rightsAcknowledged: boolean;
}): FullLengthExportReadinessItem[] {
  const trackAStem = stemArtifactAvailable(params.artifactStore, "trackA");
  const trackBStem = stemArtifactAvailable(params.artifactStore, "trackB");

  const combinedReady = params.context
    ? isCombinedPreviewReady({
        sidecarOnline: params.sidecarOnline,
        rubberBandAvailable: params.rubberBandAvailable,
        context: params.context,
        useNeutralProcessing: params.useNeutralProcessing,
      })
    : { ready: false, reason: "Pitch/time plan unavailable." };

  const planReady =
    params.useNeutralProcessing && params.confirmNeutralSettings
      ? true
      : combinedReady.ready;

  return [
    {
      id: "track-a-stems",
      label: "Track A stems available",
      ready: trackAStem,
      detail: trackAStem ? "Stem preview artifact present." : "Create Track A stem preview first.",
    },
    {
      id: "track-b-stems",
      label: "Track B stems available",
      ready: trackBStem,
      detail: trackBStem ? "Stem preview artifact present." : "Create Track B stem preview first.",
    },
    {
      id: "rubberband",
      label: "Rubber Band available",
      ready: params.rubberBandAvailable,
      detail: params.rubberBandAvailable
        ? "Rubber Band CLI detected."
        : "Rubber Band CLI required for vocal pitch/time.",
    },
    {
      id: "ffmpeg",
      label: "FFmpeg available",
      ready: params.ffmpegAvailable,
      detail: params.ffmpegAvailable ? "FFmpeg detected." : "FFmpeg required for mix and readout.",
    },
    {
      id: "plan",
      label: "Pitch/time plan or neutral mode confirmed",
      ready: planReady,
      detail: planReady
        ? params.useNeutralProcessing
          ? "Neutral settings confirmed."
          : combinedReady.reason
        : combinedReady.reason,
    },
    {
      id: "rights",
      label: "Rights notice acknowledged",
      ready: params.rightsAcknowledged,
      detail: params.rightsAcknowledged
        ? "User acknowledged rights responsibility."
        : "Acknowledge the rights notice before export.",
    },
  ];
}

export function isFullLengthExportReady(items: FullLengthExportReadinessItem[]): boolean {
  return items.every((item) => item.ready);
}

export function formatReadinessChecklist(items: FullLengthExportReadinessItem[]): string[] {
  return items.map((item) => `${item.ready ? "✓" : "○"} ${item.label} — ${item.detail}`);
}

export function buildFullLengthExportRequestParams(
  context: CombinedPreviewDirectionContext,
  useNeutralProcessing: boolean,
  confirmNeutralSettings: boolean,
  loudnessTargetMode: FullLengthLoudnessMode,
  exportLabel?: string | null
): FullLengthExportRequestParams {
  const previewParams = buildCombinedPreviewRequestParams(context, useNeutralProcessing);

  return {
    sourceVocalStemArtifactId: previewParams.sourceVocalArtifactId,
    targetInstrumentalStemArtifactId: previewParams.targetInstrumentalArtifactId,
    mashIntent: previewParams.mashIntent,
    tempoRatio: previewParams.tempoRatio,
    sourceBpm: previewParams.sourceBpm,
    targetBpm: previewParams.targetBpm,
    pitchShiftSemitones: previewParams.pitchShiftSemitones,
    alignmentOffsetMs: previewParams.alignmentOffsetMs,
    exportLabel: exportLabel ?? null,
    loudnessTargetMode,
    neutralProcessing: useNeutralProcessing,
    confirmNeutralSettings: confirmNeutralSettings,
  };
}

export function validateFullLengthExportRequest(params: FullLengthExportRequestParams): string[] {
  const errors: string[] = [];

  if (!/^[a-zA-Z0-9]+$/.test(params.sourceVocalStemArtifactId)) {
    errors.push("source_vocal_stem_artifact_id must be alphanumeric stem artifact id.");
  }
  if (!/^[a-zA-Z0-9]+$/.test(params.targetInstrumentalStemArtifactId)) {
    errors.push("target_instrumental_stem_artifact_id must be alphanumeric stem artifact id.");
  }
  if (
    params.loudnessTargetMode !== "measurement_only" &&
    params.loudnessTargetMode !== "normalize_preview_copy" &&
    params.loudnessTargetMode !== "normalize_export"
  ) {
    errors.push("Invalid loudness_target_mode for full-length export.");
  }
  if (!params.neutralProcessing && !params.confirmNeutralSettings) {
    const hasPlan =
      params.tempoRatio !== null ||
      params.sourceBpm !== null ||
      params.targetBpm !== null ||
      Math.abs(params.pitchShiftSemitones) >= 0.001;
    if (!hasPlan) {
      errors.push("Confirm neutral settings or provide pitch/time plan values.");
    }
  }
  if (params.exportLabel && params.exportLabel.trim().length > 120) {
    errors.push("export_label must be 120 characters or fewer.");
  }

  return errors;
}

export function fullLengthExportUsesStemSources(params: FullLengthExportRequestParams): boolean {
  return (
    /^[a-zA-Z0-9]+$/.test(params.sourceVocalStemArtifactId) &&
    /^[a-zA-Z0-9]+$/.test(params.targetInstrumentalStemArtifactId)
  );
}

export function evaluateLoudnessGateDisplay(loudness: LoudnessReadout | null): LoudnessGateDisplay {
  if (!loudness || loudness.status === "not_available") {
    return {
      status: "not_available",
      message:
        "Loudness gate unavailable — not a club-ready master claim.",
      integratedLufs: loudness?.integratedLufs ?? null,
      truePeakDbtp: loudness?.truePeakDbtp ?? null,
      targetIntegratedLufs: GENERAL_LOUDNESS_TARGET_LUFS,
      targetTruePeakDbtp: GENERAL_TRUE_PEAK_TARGET_DBTP,
    };
  }

  const integrated = loudness.integratedLufs;
  const truePeak = loudness.truePeakDbtp;
  const warnReasons: string[] = [];

  if (integrated !== null && Math.abs(integrated - GENERAL_LOUDNESS_TARGET_LUFS) > 2) {
    warnReasons.push(
      `integrated ${integrated.toFixed(1)} LUFS vs target ${GENERAL_LOUDNESS_TARGET_LUFS} LUFS`
    );
  }
  if (truePeak !== null && truePeak > GENERAL_TRUE_PEAK_TARGET_DBTP + 0.5) {
    warnReasons.push(
      `true peak ${truePeak.toFixed(1)} dBTP vs target ${GENERAL_TRUE_PEAK_TARGET_DBTP} dBTP`
    );
  }

  if (loudness.status === "partial" || warnReasons.length > 0) {
    return {
      status: "warn",
      message:
        (warnReasons.length > 0 ? warnReasons.join("; ") : loudness.message) +
        " — informational gate only.",
      integratedLufs: integrated,
      truePeakDbtp: truePeak,
      targetIntegratedLufs: GENERAL_LOUDNESS_TARGET_LUFS,
      targetTruePeakDbtp: GENERAL_TRUE_PEAK_TARGET_DBTP,
    };
  }

  return {
    status: "pass",
    message: `Within general display targets (~${GENERAL_LOUDNESS_TARGET_LUFS} LUFS / ${GENERAL_TRUE_PEAK_TARGET_DBTP} dBTP). Informational only.`,
    integratedLufs: integrated,
    truePeakDbtp: truePeak,
    targetIntegratedLufs: GENERAL_LOUDNESS_TARGET_LUFS,
    targetTruePeakDbtp: GENERAL_TRUE_PEAK_TARGET_DBTP,
  };
}

export function buildPitchTimePlanForExport(
  artifactStore: SessionArtifactStore,
  intent: MashIntent,
  rubberBandStatus: RubberBandReadiness,
  rubberBandMessage: string
) {
  return buildPitchTimePlanFromArtifacts({
    artifactStore,
    intent,
    rubberBandStatus,
    rubberBandMessage,
  });
}

export const DEFAULT_FULL_EXPORT_RIGHTS_NOTICE = requiredRightsNotice;

export function fullLengthExportModeLabel(mode: FullLengthLoudnessMode): string {
  if (mode === "normalize_export" || mode === "normalize_preview_copy") {
    return "Normalize export copy (prototype — not full mastering)";
  }
  return "Measurement only (default)";
}
