export const EXPORT_PREP_LOCKED_NOTICE =
  "Create stem previews for both tracks (or a combined preview) to unlock local WAV export.";

export const EXPORT_PREP_ACTIVE_NOTICE =
  "Local WAV export from combined preview — user-initiated only. Not a published release.";

export const EXPORT_MP3_STEMS_NOTICE =
  "Stem package export, mastering presets, and public sharing are not implemented.";

export const EXPORT_GENERAL_LUFS_TARGET = "-14 LUFS";
export const EXPORT_GENERAL_TRUE_PEAK_TARGET = "-1 dBTP";
export const EXPORT_CLUB_VERSION_NOTE = "Club version target is planned — not implemented in MVP.";

export interface ExportTargetPlan {
  id: string;
  label: string;
  description: string;
  status: "locked" | "available";
}

export const exportTargetPlans: ExportTargetPlan[] = [
  {
    id: "wav",
    label: "WAV export",
    description: "Local WAV from combined preview copy or full-length stem re-render.",
    status: "available",
  },
  {
    id: "mp3",
    label: "MP3 reference export",
    description: "Local MP3 from an existing WAV export artifact.",
    status: "available",
  },
  {
    id: "stems",
    label: "Stems export",
    description: "Future separated-stem package delivery.",
    status: "locked",
  },
  {
    id: "dj-preview-master",
    label: "Mastering presets",
    description: "Local mastering preset prototypes from WAV exports.",
    status: "available",
  },
];

export function exportPanelClaimsFinalMaster(): boolean {
  return false;
}

export function exportPanelIsLocked(hasExportSource: boolean): boolean {
  return !hasExportSource;
}

export function isWavExportAvailable(hasExportSource: boolean): boolean {
  return hasExportSource;
}

export function hasFullLengthExportSource(artifactStore: {
  tracks: Record<string, { stemPreview?: { artifactId: string } | null } | null>;
}): boolean {
  return Boolean(
    artifactStore.tracks.trackA?.stemPreview?.artifactId &&
      artifactStore.tracks.trackB?.stemPreview?.artifactId
  );
}

export function exportPanelHasAnySource(
  hasCombinedPreview: boolean,
  hasStemArtifacts: boolean
): boolean {
  return hasCombinedPreview || hasStemArtifacts;
}

export function isMp3ExportAvailable(wavExportCount: number): boolean {
  return wavExportCount > 0;
}

export function isMasteringAvailable(wavExportCount: number): boolean {
  return wavExportCount > 0;
}

export function formatLoudnessTargetSummary(): string {
  return `Future general playback target: ${EXPORT_GENERAL_LUFS_TARGET} integrated / ${EXPORT_GENERAL_TRUE_PEAK_TARGET} true peak (planned).`;
}
