import type { ServiceCapability } from "../lib/localEngine/types.ts";
import {
  buildStemPreviewFormData,
  validateStemPreviewRequestParams,
} from "../lib/localEngine/stemPreview.ts";
import type { StemPreviewRequestParams, StemPreviewResult } from "./stemPreview.ts";
import { buildStemPreviewRequestParams } from "./stemPreview.ts";
import type { QuickMixSectionSelection } from "./quickMixSection.ts";
import type { QuickMixStepId } from "./quickMix.ts";
import { buildQuickMixReadiness, isQuickMixReady, type QuickMixReadinessSummary } from "./quickMixReadiness.ts";

/** Must match demucs_processing.MAX_PREVIEW_SECONDS_LIMIT (180). */
export const QUICK_MIX_STEM_MAX_SECONDS = 180;

export type QuickMixSource = "vocal" | "instrumental";

export const QUICK_MIX_STEM_FORM_FIELDS = [
  "file",
  "split_mode",
  "max_preview_seconds",
  "preview_start_seconds",
] as const;

export function quickMixSourceLabel(source: QuickMixSource): string {
  return source === "vocal" ? "Vocal / acapella source" : "Instrumental / beat source";
}

export function quickMixStepForSource(source: QuickMixSource): QuickMixStepId {
  return source === "vocal" ? "separating_vocal" : "preparing_instrumental";
}

export function buildQuickMixStemRequestParams(
  source: QuickMixSource,
  file: File,
  section: QuickMixSectionSelection,
  prepared: boolean
): StemPreviewRequestParams {
  const trackSlotId = source === "vocal" ? "trackA" : "trackB";
  return {
    ...buildStemPreviewRequestParams(trackSlotId, file),
    maxPreviewSeconds: section.windowSeconds,
    previewStartSeconds: prepared ? 0 : section.startOffsetSeconds,
  };
}

export function validateQuickMixStemRequest(params: StemPreviewRequestParams): string[] {
  return validateStemPreviewRequestParams(params);
}

export function buildQuickMixStemFormData(
  file: File,
  source: QuickMixSource,
  section: QuickMixSectionSelection,
  prepared: boolean
): FormData {
  return buildStemPreviewFormData(file, buildQuickMixStemRequestParams(source, file, section, prepared));
}

export function listQuickMixStemFormFieldNames(formData: FormData): string[] {
  return [...formData.keys()];
}

/**
 * Stem bundle ids: vocal source supplies vocals.wav; instrumental source supplies no_vocals.wav.
 * The sidecar resolves stem role from artifact id + export field.
 */
export function resolveQuickMixExportStemIds(params: {
  vocalStem: StemPreviewResult;
  instrumentalStem: StemPreviewResult;
}): { sourceVocalStemArtifactId: string; targetInstrumentalStemArtifactId: string } | null {
  const vocalId = params.vocalStem.ok ? params.vocalStem.artifactId : null;
  const instrumentalId = params.instrumentalStem.ok ? params.instrumentalStem.artifactId : null;
  if (!vocalId || !instrumentalId) {
    return null;
  }
  if (!params.vocalStem.vocals || !params.instrumentalStem.noVocals) {
    return null;
  }
  return {
    sourceVocalStemArtifactId: vocalId,
    targetInstrumentalStemArtifactId: instrumentalId,
  };
}

export function assertQuickMixDependenciesReady(params: {
  sidecarOnline: boolean;
  capabilities: ServiceCapability[];
}): QuickMixReadinessSummary {
  const summary = buildQuickMixReadiness(params);
  if (!isQuickMixReady(summary)) {
    return summary;
  }
  return summary;
}

export function missingQuickMixDependencyLabels(summary: QuickMixReadinessSummary): string[] {
  return summary.items.filter((item) => !item.ready).map((item) => item.label);
}

export const QUICK_MIX_PIPELINE_STAGES = [
  "validate_uploads",
  "check_dependencies",
  "stem_vocal",
  "stem_instrumental",
  "timing_strategy",
  "mix_and_export_wav",
  "export_mp3_optional",
] as const;

export type QuickMixPipelineStage = (typeof QUICK_MIX_PIPELINE_STAGES)[number];

export function quickMixStageTriggersProcessing(stage: QuickMixPipelineStage): boolean {
  return stage !== "validate_uploads";
}
