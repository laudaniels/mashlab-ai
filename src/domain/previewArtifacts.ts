import type { SlotId } from "./types.ts";

export type PreviewArtifactType =
  | "stem"
  | "combined-preview"
  | "pitch-time-preview"
  | "export"
  | "master"
  | "package";

export const PREVIEW_ARTIFACT_LABEL =
  "Preview only — not a final export or master.";

export const EXPORT_ARTIFACT_LABEL =
  "Local export — user responsible for rights. No public distribution rights granted.";

export const MASTER_ARTIFACT_LABEL =
  "Local mastering prototype — user responsible for rights. No public distribution rights granted.";

export const MP3_EXPORT_ARTIFACT_LABEL =
  "Local MP3 reference export — user responsible for rights. No public distribution rights granted.";

export const PACKAGE_ARTIFACT_LABEL =
  "Local project package — user responsible for rights. No public distribution rights granted. Not public sharing.";

export interface PreviewArtifactRegistryEntry {
  artifactId: string;
  artifactType: PreviewArtifactType;
  createdAt: string;
  sourceTrackSlot: SlotId | null;
  targetTrackSlot: SlotId | null;
  mashIntent: string | null;
  label: string;
  isPreviewOnly: true;
  finalExport: false;
}

export interface PreviewArtifactPlaybackUrls {
  primary: string | null;
  vocals: string | null;
  noVocals: string | null;
}

export interface PreviewArtifactSummary {
  artifactId: string;
  artifactType: PreviewArtifactType;
  status: string;
  createdAt: string;
  durationSeconds: number | null;
  playbackUrls: PreviewArtifactPlaybackUrls;
  playbackUrl: string | null;
  previewOnly: boolean;
  finalExport: boolean;
  previewLabel: string;
  primaryFileName: string;
  sourceTrackLabel: string | null;
  targetTrackLabel: string | null;
  registryLabel: string | null;
  sourceCombinedPreviewArtifactId: string | null;
  exportSubtype: string | null;
  exportFormat: string | null;
  sourceVocalStemArtifactId: string | null;
  targetInstrumentalStemArtifactId: string | null;
  sourceWavExportArtifactId: string | null;
  masterPreset: string | null;
  masteringPrototype: boolean;
  packageOnly: boolean;
  packageSubtype: string | null;
  packageLabel: string | null;
  includedFileCount: number | null;
  selectedArtifactIds: string[] | null;
  publicShare: boolean;
  mixSummary: string | null;
  arrangementDraftType: string | null;
  arrangementSectionLabel: string | null;
  arrangementPreviewStartSeconds: number | null;
  arrangementDurationSeconds: number | null;
  arrangementPhraseBasis: string | null;
  arrangementContextSummary: string | null;
  arrangementExportContextMode: string | null;
  sectionTrimmedExport: boolean;
  bindingFreshnessAtExport: string | null;
}

export interface LoudnessReadout {
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  peakLevelDb: number | null;
  status: string;
  message: string;
}

export interface ArtifactTechnicalReadout {
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  codec: string | null;
  container: string | null;
  fileSizeBytes: number | null;
  loudness: LoudnessReadout;
}

export interface ArtifactMetadataResult {
  ok: boolean;
  status: string;
  message: string;
  artifactId: string | null;
  artifactType: PreviewArtifactType | null;
  previewOnly: boolean;
  finalExport: boolean;
  playbackUrl: string | null;
  playbackPlaybackUrl: string | null;
  technical: ArtifactTechnicalReadout | null;
}

export function previewArtifactClaimsFinalExport(artifact: PreviewArtifactSummary): boolean {
  return artifact.finalExport === true;
}

export function isPreviewArtifactType(value: string): value is PreviewArtifactType {
  return (
    value === "stem" ||
    value === "combined-preview" ||
    value === "pitch-time-preview" ||
    value === "export" ||
    value === "master" ||
    value === "package"
  );
}

export function isExportArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "export";
}

export function isMasterArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "master";
}

export function isPackagePreviewArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "package" || artifact.packageOnly === true;
}

export function isCombinedPreviewArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "combined-preview";
}

export function formatTrackSlotLabel(slotId: SlotId | null): string | null {
  if (slotId === "trackA") {
    return "Track A";
  }
  if (slotId === "trackB") {
    return "Track B";
  }
  return null;
}

export function formatArtifactArrangementTraceability(
  artifact: PreviewArtifactSummary
): string[] {
  if (!artifact.arrangementSectionLabel && !artifact.arrangementContextSummary) {
    return [];
  }

  return [
    artifact.arrangementContextSummary ??
      `${artifact.arrangementDraftType?.replace(/_/g, " ") ?? "Draft"} · ${artifact.arrangementSectionLabel} · advisory arrangement section — DJ review required`,
    ...(artifact.arrangementDurationSeconds !== null
      ? [`Duration: ${artifact.arrangementDurationSeconds}s`]
      : []),
    ...(artifact.arrangementPreviewStartSeconds !== null &&
    artifact.arrangementPreviewStartSeconds > 0
      ? [`Preview start offset: ${artifact.arrangementPreviewStartSeconds.toFixed(1)}s`]
      : []),
    ...(artifact.arrangementPhraseBasis
      ? [`Phrase basis: ${artifact.arrangementPhraseBasis.replace(/_/g, " ")}`]
      : []),
    ...(artifact.arrangementExportContextMode === "full_length_context_only"
      ? ["Arrangement context only — full-length render."]
      : []),
    ...(artifact.arrangementExportContextMode === "section_export" ||
    artifact.sectionTrimmedExport
      ? ["Section window export — advisory planning window only."]
      : []),
    ...(artifact.bindingFreshnessAtExport
      ? [`Context at export: ${artifact.bindingFreshnessAtExport.replace(/_/g, " ")}`]
      : []),
    "Arrangement sections are advisory and do not grant rights.",
  ];
}

export function buildRegistryEntry(params: {
  artifactId: string;
  artifactType: PreviewArtifactType;
  sourceTrackSlot?: SlotId | null;
  targetTrackSlot?: SlotId | null;
  mashIntent?: string | null;
  label: string;
}): PreviewArtifactRegistryEntry {
  return {
    artifactId: params.artifactId,
    artifactType: params.artifactType,
    createdAt: new Date().toISOString(),
    sourceTrackSlot: params.sourceTrackSlot ?? null,
    targetTrackSlot: params.targetTrackSlot ?? null,
    mashIntent: params.mashIntent ?? null,
    label: params.label,
    isPreviewOnly: true,
    finalExport: false,
  };
}
