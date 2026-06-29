export const ARTIFACTS_WORKSPACE_ROOT = ".work/artifacts";

export const ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9]+$/;

export const ALLOWED_ARTIFACT_TYPES = [
  "stem",
  "combined-preview",
  "pitch-time-preview",
  "export",
  "master",
  "package",
] as const;

export function isSafeArtifactId(artifactId: string): boolean {
  return ARTIFACT_ID_PATTERN.test(artifactId);
}

export function validateArtifactIdForCleanup(artifactId: string): string[] {
  const errors: string[] = [];

  if (!artifactId.trim()) {
    errors.push("Artifact id is required.");
  }

  if (artifactId.includes("..") || artifactId.includes("/") || artifactId.includes("\\")) {
    errors.push("Artifact id must not contain path separators or traversal sequences.");
  }

  if (!isSafeArtifactId(artifactId)) {
    errors.push("Artifact id must contain only letters and numbers.");
  }

  return errors;
}

export function artifactDeletionScopeNotice(): string {
  return `Cleanup deletes only local preview/export artifacts under ${ARTIFACTS_WORKSPACE_ROOT}. Raw uploads and browser session files are not removed.`;
}

export function formatArtifactLifecycleSummary(params: {
  artifactType: string;
  artifactId: string;
  action: "delete" | "clear";
}): string {
  if (params.action === "clear") {
    return `Clear session removes all listed artifacts under ${ARTIFACTS_WORKSPACE_ROOT}.`;
  }

  return `Delete ${params.artifactType} artifact ${params.artifactId} from ${ARTIFACTS_WORKSPACE_ROOT} only.`;
}
