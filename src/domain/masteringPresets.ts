import { requiredRightsNotice } from "../lib/legal.ts";
import type { LoudnessReadout, PreviewArtifactSummary } from "./previewArtifacts.ts";

export const MASTER_ARTIFACT_LABEL =
  "Local mastering prototype — user responsible for rights. No public distribution rights granted.";

export const MASTERING_PROTOTYPE_NOTICE =
  "Mastering presets are local prototypes — not professional mastering or club-ready finals.";

export const MASTERING_DJ_REVIEW_NOTICE =
  "DJ loudness prototype requires DJ review before any live use. Distortion and dynamics loss are possible.";

export const MASTERING_NO_RIGHTS_NOTICE =
  "No public distribution rights granted. MP3, stem package, and public sharing remain separate.";

export const MEASUREMENT_ONLY_PRESET = "measurement_only";
export const GENERAL_SAFE_NORMALIZE_PRESET = "general_safe_normalize";
export const DJ_LOUDNESS_PROTOTYPE_PRESET = "dj_loudness_prototype";

export const ALLOWED_MASTERING_PRESETS = [
  MEASUREMENT_ONLY_PRESET,
  GENERAL_SAFE_NORMALIZE_PRESET,
  DJ_LOUDNESS_PROTOTYPE_PRESET,
] as const;

export type MasteringPresetId = (typeof ALLOWED_MASTERING_PRESETS)[number];

export const DEFAULT_MASTERING_PRESET: MasteringPresetId = MEASUREMENT_ONLY_PRESET;

export interface MasteringPresetDefinition {
  id: MasteringPresetId;
  label: string;
  description: string;
  targetIntegratedLufs: number | null;
  targetTruePeakDbtp: number;
  createsAudio: boolean;
  warnings: string[];
}

export const MASTERING_PRESET_DEFINITIONS: MasteringPresetDefinition[] = [
  {
    id: MEASUREMENT_ONLY_PRESET,
    label: "Measurement only",
    description: "Analyze loudness and technical readout without changing audio.",
    targetIntegratedLufs: -14,
    targetTruePeakDbtp: -1,
    createsAudio: false,
    warnings: ["No audio changes — readout only."],
  },
  {
    id: GENERAL_SAFE_NORMALIZE_PRESET,
    label: "General safe normalize",
    description: "FFmpeg loudnorm prototype for general playback reference (~-14 LUFS / -1 dBTP).",
    targetIntegratedLufs: -14,
    targetTruePeakDbtp: -1,
    createsAudio: true,
    warnings: ["General playback reference prototype — not professional mastering."],
  },
  {
    id: DJ_LOUDNESS_PROTOTYPE_PRESET,
    label: "DJ loudness prototype",
    description:
      "Conservative louder prototype (~-9.5 LUFS / -1 dBTP). DJ review required — not club-mastered.",
    targetIntegratedLufs: -9.5,
    targetTruePeakDbtp: -1,
    createsAudio: true,
    warnings: [
      "May affect dynamics and increase distortion risk.",
      "DJ review required before live use.",
    ],
  },
];

export interface TechnicalReadoutDisplay {
  durationSeconds: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  codec: string | null;
  container: string | null;
  fileSizeBytes: number | null;
  loudness: LoudnessReadout;
}

export interface MasteringGateDisplay {
  status: string;
  message: string;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  targetIntegratedLufs: number;
  targetTruePeakDbtp: number;
}

export interface MasterWavRequestParams {
  sourceWavExportArtifactId: string;
  preset: MasteringPresetId;
  exportLabel?: string | null;
}

export interface MasterWavResult {
  ok: boolean;
  status: string;
  message: string;
  masterArtifactId: string | null;
  sourceWavExportArtifactId: string | null;
  preset: string | null;
  artifactUrl: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  beforeReadout: TechnicalReadoutDisplay | null;
  afterReadout: TechnicalReadoutDisplay | null;
  targetIntegratedLufs: number | null;
  targetTruePeakDbtp: number | null;
  loudnessGate: MasteringGateDisplay | null;
  audioCreated: boolean;
  finalExport: boolean;
  publicShare: boolean;
  masteringPrototype: boolean;
  rightsNotice: string;
  warnings: string[];
  limitations: string[];
  exportLabel: string | null;
  validationErrors: string[] | null;
  setupGuidance: string | null;
}

export function validateMasterWavRequest(params: MasterWavRequestParams): string[] {
  const errors: string[] = [];

  if (!/^[a-zA-Z0-9]+$/.test(params.sourceWavExportArtifactId)) {
    errors.push("source_wav_export_artifact_id must be alphanumeric.");
  }

  if (!ALLOWED_MASTERING_PRESETS.includes(params.preset)) {
    errors.push(
      "preset must be measurement_only, general_safe_normalize, or dj_loudness_prototype."
    );
  }

  if (params.exportLabel && params.exportLabel.trim().length > 120) {
    errors.push("export_label must be 120 characters or fewer.");
  }

  return errors;
}

export function isAllowedMasteringPreset(value: string): value is MasteringPresetId {
  return ALLOWED_MASTERING_PRESETS.includes(value as MasteringPresetId);
}

export function parseMasteringPreset(value: unknown): MasteringPresetId {
  if (typeof value === "string" && isAllowedMasteringPreset(value)) {
    return value;
  }
  return DEFAULT_MASTERING_PRESET;
}

export function getMasteringPresetDefinition(
  presetId: MasteringPresetId
): MasteringPresetDefinition {
  return (
    MASTERING_PRESET_DEFINITIONS.find((item) => item.id === presetId) ??
    MASTERING_PRESET_DEFINITIONS[0]!
  );
}

export function formatMasteringPresetName(presetId: string | null): string {
  if (!presetId) {
    return "Unknown preset";
  }
  const def = MASTERING_PRESET_DEFINITIONS.find((item) => item.id === presetId);
  return def?.label ?? presetId;
}

export function formatTargetLoudnessSummary(preset: MasteringPresetDefinition): string {
  const lufs =
    preset.targetIntegratedLufs !== null
      ? `${preset.targetIntegratedLufs} LUFS integrated`
      : "measurement reference";
  return `${lufs} · ${preset.targetTruePeakDbtp} dBTP true peak ceiling`;
}

export function formatGateStatus(gate: MasteringGateDisplay | null): string {
  if (!gate) {
    return "not_available";
  }
  return gate.status;
}

export function formatReadoutLoudnessLine(readout: TechnicalReadoutDisplay | null): string {
  if (!readout) {
    return "Readout not available.";
  }
  const { loudness } = readout;
  const integrated =
    loudness.integratedLufs !== null
      ? `${loudness.integratedLufs.toFixed(1)} LUFS`
      : "not available";
  const truePeak =
    loudness.truePeakDbtp !== null
      ? `${loudness.truePeakDbtp.toFixed(1)} dBTP`
      : "not available";
  return `Loudness (${loudness.status}): ${integrated} · True peak: ${truePeak}`;
}

export function masteringPanelIsLocked(wavExports: PreviewArtifactSummary[]): boolean {
  return wavExports.length === 0;
}

export function isMasterArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "master";
}

export function masterResultClaimsFinalExport(result: MasterWavResult): boolean {
  return result.ok && result.finalExport === true;
}

export function masterResultGrantsPublicShare(result: MasterWavResult): boolean {
  return result.publicShare === true;
}

export function masterResultIsPrototype(result: MasterWavResult): boolean {
  return result.ok && result.masteringPrototype === true;
}

export function formatMasteringWarnings(result: MasterWavResult): string[] {
  return [...result.warnings, ...result.limitations];
}

export function formatArtifactTypeLabel(artifact: PreviewArtifactSummary): string {
  if (artifact.artifactType === "package") {
    return artifact.packageSubtype ? `package / ${artifact.packageSubtype}` : "package / folder";
  }
  if (artifact.artifactType === "master") {
    return artifact.masterPreset ? `master / ${artifact.masterPreset}` : "master / wav";
  }
  if (artifact.artifactType === "export") {
    if (artifact.exportFormat === "mp3" || artifact.exportSubtype === "mp3") {
      return "export / mp3";
    }
    if (artifact.exportSubtype === "full-wav") {
      return "export / full-wav";
    }
    if (artifact.exportSubtype === "preview-copy") {
      return "export / wav";
    }
    return artifact.exportSubtype ? `export / ${artifact.exportSubtype}` : "export / wav";
  }
  if (artifact.exportSubtype) {
    return `${artifact.artifactType} / ${artifact.exportSubtype}`;
  }
  return artifact.artifactType;
}

export const DEFAULT_MASTER_RIGHTS_NOTICE = requiredRightsNotice;
