export const EXPORT_PREP_LOCKED_NOTICE =
  "Export is not implemented yet. Current previews are not final masters.";

export const EXPORT_GENERAL_LUFS_TARGET = "-14 LUFS";
export const EXPORT_GENERAL_TRUE_PEAK_TARGET = "-1 dBTP";
export const EXPORT_CLUB_VERSION_NOTE = "Club version target is planned — not implemented in MVP.";

export interface ExportTargetPlan {
  id: string;
  label: string;
  description: string;
  status: "locked";
}

export const exportTargetPlans: ExportTargetPlan[] = [
  {
    id: "wav",
    label: "WAV export",
    description: "Primary lossless master export path.",
    status: "locked",
  },
  {
    id: "mp3",
    label: "MP3 export",
    description: "Optional compressed reference render.",
    status: "locked",
  },
  {
    id: "stems",
    label: "Stems export",
    description: "Future separated-stem package delivery.",
    status: "locked",
  },
  {
    id: "dj-preview-master",
    label: "DJ-safe preview master",
    description: "Future loudness/true-peak checked preview master — not the same as current previews.",
    status: "locked",
  },
];

export function exportPanelClaimsFinalMaster(): boolean {
  return false;
}

export function exportPanelIsLocked(): boolean {
  return true;
}

export function formatLoudnessTargetSummary(): string {
  return `Future general playback target: ${EXPORT_GENERAL_LUFS_TARGET} integrated / ${EXPORT_GENERAL_TRUE_PEAK_TARGET} true peak (planned).`;
}
