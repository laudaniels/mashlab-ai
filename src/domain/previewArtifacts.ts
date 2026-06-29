import type { SlotId } from "./types.ts";

export type PreviewArtifactType = "stem" | "combined-preview" | "pitch-time-preview";

export const PREVIEW_ARTIFACT_LABEL =
  "Preview only — not a final export or master.";

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
  return value === "stem" || value === "combined-preview" || value === "pitch-time-preview";
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
