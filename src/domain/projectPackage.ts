import { requiredRightsNotice } from "../lib/legal.ts";
import type { PreviewArtifactSummary } from "./previewArtifacts.ts";
import { isMp3ExportArtifact } from "./mp3Export.ts";
import { isMasterArtifact } from "./masteringPresets.ts";

export const PACKAGE_ARTIFACT_LABEL =
  "Local project package — user responsible for rights. No public distribution rights granted. Not public sharing.";

export const PACKAGE_EXPORT_NOTICE =
  "Local project package — user-initiated organization only. Not public sharing or distribution.";

export const PACKAGE_RAW_UPLOADS_EXCLUDED_NOTICE =
  "Raw uploads are excluded from project packages. Only existing local artifacts may be bundled.";

export const PACKAGE_MANIFEST_ALWAYS_INCLUDED =
  "manifest.json and RIGHTS_NOTICE.txt are always included in every package.";

export const ALLOWED_PACKAGE_TYPES = ["folder", "zip"] as const;
export type PackageType = (typeof ALLOWED_PACKAGE_TYPES)[number];

export const DEFAULT_PACKAGE_TYPE: PackageType = "folder";

export interface PackageIncludedFile {
  artifactId: string;
  artifactType: string;
  artifactSubtype: string | null;
  sourcePath: string;
  packagePath: string;
}

export interface PackageExportRequestParams {
  packageLabel: string;
  selectedArtifactIds: string[];
  packageType: PackageType;
  includeTechnicalReport: boolean;
}

export interface PackageExportResult {
  ok: boolean;
  status: string;
  message: string;
  packageArtifactId: string | null;
  packageLabel: string | null;
  packageType: PackageType | null;
  localFolderPath: string | null;
  downloadUrl: string | null;
  playbackUrl: string | null;
  manifestPath: string | null;
  rightsNoticePath: string | null;
  technicalReportPath: string | null;
  includedFiles: PackageIncludedFile[];
  includedArtifactIds: string[];
  publicShare: boolean;
  packageOnly: boolean;
  rightsNotice: string;
  warnings: string[];
  limitations: string[];
  validationErrors: string[] | null;
  setupGuidance: string | null;
}

const SAFE_LABEL_PATTERN = /[^a-zA-Z0-9._-]+/g;
const ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9]+$/;

export function sanitizePackageLabel(label: string): string {
  const cleaned = label.trim().replace(SAFE_LABEL_PATTERN, "_").replace(/^[._-]+|[._-]+$/g, "");
  if (!cleaned) {
    return "project";
  }
  return cleaned.slice(0, 80);
}

export function isPackageableArtifact(artifact: PreviewArtifactSummary): boolean {
  if (artifact.artifactType === "package") {
    return false;
  }
  if (artifact.artifactType === "pitch-time-preview") {
    return false;
  }
  if (isMasterArtifact(artifact) && !artifact.playbackUrl) {
    return false;
  }
  return (
    artifact.artifactType === "stem" ||
    artifact.artifactType === "combined-preview" ||
    artifact.artifactType === "export" ||
    isMasterArtifact(artifact)
  );
}

export function isPackageArtifact(artifact: PreviewArtifactSummary): boolean {
  return artifact.artifactType === "package" || artifact.packageOnly === true;
}

export function packageArtifactGrantsPublicShare(artifact: PreviewArtifactSummary): boolean {
  return artifact.publicShare === true;
}

export function validateSelectedArtifactIds(
  selectedIds: string[],
  eligibleArtifacts: PreviewArtifactSummary[]
): string[] {
  const errors: string[] = [];
  const eligibleIds = new Set(eligibleArtifacts.map((item) => item.artifactId));

  if (selectedIds.length === 0) {
    errors.push("Select at least one artifact to include in the package.");
  }

  for (const artifactId of selectedIds) {
    if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
      errors.push(`Invalid artifact id: ${artifactId}`);
      continue;
    }
    if (!eligibleIds.has(artifactId)) {
      errors.push(`Artifact is not packageable or not found: ${artifactId}`);
    }
  }

  return errors;
}

export function validatePackageExportRequest(params: PackageExportRequestParams): string[] {
  const errors: string[] = [];

  if (!params.packageLabel.trim()) {
    errors.push("Package label is required.");
  }

  if (params.packageLabel.trim().length > 120) {
    errors.push("Package label must be 120 characters or fewer.");
  }

  if (!ALLOWED_PACKAGE_TYPES.includes(params.packageType)) {
    errors.push("Package type must be folder or zip.");
  }

  return errors;
}

function latestByCreatedAt(artifacts: PreviewArtifactSummary[]): PreviewArtifactSummary | null {
  if (artifacts.length === 0) {
    return null;
  }
  const sorted = [...artifacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted[sorted.length - 1] ?? null;
}

export function selectDefaultPackageArtifacts(
  artifacts: PreviewArtifactSummary[]
): string[] {
  const packageable = artifacts.filter(isPackageableArtifact);
  const selected: string[] = [];

  const fullWav = latestByCreatedAt(
    packageable.filter(
      (item) => item.artifactType === "export" && item.exportSubtype === "full-wav"
    )
  );
  if (fullWav) {
    selected.push(fullWav.artifactId);
  } else {
    const previewWav = latestByCreatedAt(
      packageable.filter(
        (item) =>
          item.artifactType === "export" &&
          item.exportFormat !== "mp3" &&
          item.exportSubtype !== "mp3"
      )
    );
    if (previewWav) {
      selected.push(previewWav.artifactId);
    }
  }

  const mp3 = latestByCreatedAt(packageable.filter(isMp3ExportArtifact));
  if (mp3) {
    selected.push(mp3.artifactId);
  }

  const master = latestByCreatedAt(
    packageable.filter((item) => isMasterArtifact(item) && item.playbackUrl)
  );
  if (master) {
    selected.push(master.artifactId);
  }

  for (const stem of packageable.filter((item) => item.artifactType === "stem")) {
    if (!selected.includes(stem.artifactId)) {
      selected.push(stem.artifactId);
    }
  }

  const combined = latestByCreatedAt(
    packageable.filter((item) => item.artifactType === "combined-preview")
  );
  if (combined && !selected.includes(combined.artifactId)) {
    selected.push(combined.artifactId);
  }

  return selected;
}

export function formatPackageArtifactLabel(artifact: PreviewArtifactSummary): string {
  if (artifact.packageLabel) {
    return artifact.packageLabel;
  }
  if (artifact.packageSubtype) {
    return `Project package (${artifact.packageSubtype})`;
  }
  return "Project package";
}

export function formatPackageManifestSummary(result: PackageExportResult): string {
  if (!result.ok) {
    return result.message;
  }
  const fileCount = result.includedFiles.length;
  const typeLabel = result.packageType ?? "folder";
  return `${result.packageLabel ?? "Package"} · ${typeLabel} · ${fileCount} file(s) · manifest + rights notice included`;
}

export function formatPackageWarnings(result: PackageExportResult): string[] {
  return [...result.warnings, ...result.limitations];
}

export function packageResultRequiresRightsNotice(result: PackageExportResult): boolean {
  return result.ok && Boolean(result.rightsNotice);
}

export function packageResultIsLocalOnly(result: PackageExportResult): boolean {
  return result.ok && result.packageOnly === true && result.publicShare === false;
}

export const DEFAULT_PACKAGE_RIGHTS_NOTICE = requiredRightsNotice;

export function formatPackageableArtifactOption(artifact: PreviewArtifactSummary): string {
  if (artifact.artifactType === "stem") {
    return `Stem preview · ${artifact.registryLabel ?? artifact.sourceTrackLabel ?? artifact.artifactId}`;
  }
  if (artifact.artifactType === "combined-preview") {
    return `Combined preview · ${artifact.artifactId}`;
  }
  if (isMp3ExportArtifact(artifact)) {
    return `MP3 reference · ${artifact.artifactId}`;
  }
  if (artifact.artifactType === "export") {
    if (artifact.exportSubtype === "section-wav" || artifact.sectionTrimmedExport) {
      return `Section window WAV · ${artifact.artifactId}`;
    }
    return `${artifact.exportSubtype === "full-wav" ? "Full WAV" : "WAV export"} · ${artifact.artifactId}`;
  }
  if (isMasterArtifact(artifact)) {
    return `Master · ${artifact.masterPreset ?? "wav"} · ${artifact.artifactId}`;
  }
  return `${artifact.artifactType} · ${artifact.artifactId}`;
}
