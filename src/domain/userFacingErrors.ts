export const USER_FACING_ERROR_FALLBACK =
  "Something went wrong. Review the message below and try again after fixing the reported issue.";

export interface UserFacingErrorInput {
  status: string;
  message?: string | null;
  validationErrors?: string[] | null;
  setupGuidance?: string | null;
}

const STATUS_GUIDANCE: Record<string, string> = {
  missing_dependency:
    "Install or configure the missing local dependency, restart the sidecar, and retry.",
  missing_artifact:
    "Create the required preview or export artifact first, then retry this action.",
  wrong_artifact_type:
    "Select a compatible artifact type for this action (for example, WAV export for mastering).",
  validation_error:
    "Fix the settings shown below and retry.",
  processing_failed:
    "Processing failed locally. Check dependency health, disk space, and artifact inputs.",
  not_available:
    "Measurement was not available for this file. Results may be peak-only or omitted.",
};

export function formatUserFacingError(input: UserFacingErrorInput): string {
  const parts: string[] = [];

  if (input.validationErrors && input.validationErrors.length > 0) {
    parts.push(input.validationErrors.join(" "));
  } else if (input.message && input.message.trim().length > 0) {
    parts.push(input.message.trim());
  } else {
    parts.push(USER_FACING_ERROR_FALLBACK);
  }

  const statusGuidance = STATUS_GUIDANCE[input.status];
  if (statusGuidance && !parts.some((part) => part.includes(statusGuidance.slice(0, 20)))) {
    parts.push(statusGuidance);
  }

  if (input.setupGuidance && input.setupGuidance.trim().length > 0) {
    parts.push(input.setupGuidance.trim());
  }

  return parts.join(" ");
}

export function formatUserFacingErrorLines(input: UserFacingErrorInput): string[] {
  const lines: string[] = [];

  if (input.validationErrors && input.validationErrors.length > 0) {
    lines.push(...input.validationErrors);
  } else if (input.message) {
    lines.push(input.message);
  }

  const statusGuidance = STATUS_GUIDANCE[input.status];
  if (statusGuidance) {
    lines.push(statusGuidance);
  }

  if (input.setupGuidance) {
    lines.push(input.setupGuidance);
  }

  return lines.length > 0 ? lines : [USER_FACING_ERROR_FALLBACK];
}

export function loudnessUnavailableMessage(): string {
  return "Loudness readout not_available — peak/clipping warnings may be limited. DJ review recommended.";
}

export function artifactDeleteFailureMessage(status: string, message: string | null | undefined): string {
  return formatUserFacingError({
    status,
    message: message ?? "Could not delete artifact.",
  });
}

export function artifactClearFailureMessage(deletedCount: number, errors: string[]): string {
  if (errors.length === 0) {
    return `Cleared ${deletedCount} artifact(s).`;
  }

  return `Cleared ${deletedCount} artifact(s) with ${errors.length} error(s): ${errors.join(" · ")}`;
}
