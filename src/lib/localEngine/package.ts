import type { PackageExportResult, PackageIncludedFile } from "../../domain/projectPackage.ts";
import { DEFAULT_PACKAGE_RIGHTS_NOTICE } from "../../domain/projectPackage.ts";
import { DEFAULT_LOCAL_ENGINE_URL } from "./types.ts";

export function parsePackageExportResponse(
  payload: unknown,
  baseUrl: string = DEFAULT_LOCAL_ENGINE_URL
): PackageExportResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const downloadPath = typeof record.download_url === "string" ? record.download_url : null;

  return {
    ok: Boolean(record.ok),
    status: typeof record.status === "string" ? record.status : "unknown",
    message: typeof record.message === "string" ? record.message : "Unknown package response.",
    packageArtifactId:
      typeof record.package_artifact_id === "string" ? record.package_artifact_id : null,
    packageLabel: typeof record.package_label === "string" ? record.package_label : null,
    packageType:
      record.package_type === "folder" || record.package_type === "zip"
        ? record.package_type
        : null,
    localFolderPath:
      typeof record.local_folder_path === "string" ? record.local_folder_path : null,
    downloadUrl: downloadPath,
    playbackUrl: downloadPath ? `${baseUrl}${downloadPath}` : null,
    manifestPath: typeof record.manifest_path === "string" ? record.manifest_path : null,
    rightsNoticePath:
      typeof record.rights_notice_path === "string" ? record.rights_notice_path : null,
    technicalReportPath:
      typeof record.technical_report_path === "string" ? record.technical_report_path : null,
    includedFiles: parseIncludedFiles(record.included_files),
    includedArtifactIds: parseStringArray(record.included_artifact_ids),
    publicShare: record.public_share === true,
    packageOnly: record.package_only === true,
    rightsNotice:
      typeof record.rights_notice === "string"
        ? record.rights_notice
        : DEFAULT_PACKAGE_RIGHTS_NOTICE,
    warnings: parseStringArray(record.warnings),
    limitations: parseStringArray(record.limitations),
    validationErrors: parseStringArrayOrNull(record.validation_errors),
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
  };
}

function parseIncludedFiles(value: unknown): PackageIncludedFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.artifact_id !== "string" || typeof record.artifact_type !== "string") {
        return null;
      }
      return {
        artifactId: record.artifact_id,
        artifactType: record.artifact_type,
        artifactSubtype:
          typeof record.artifact_subtype === "string" ? record.artifact_subtype : null,
        sourcePath: typeof record.source_path === "string" ? record.source_path : "",
        packagePath: typeof record.package_path === "string" ? record.package_path : "",
      };
    })
    .filter((item): item is PackageIncludedFile => item !== null);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseStringArray(value);
}
