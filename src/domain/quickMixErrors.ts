import type { QuickMixSource } from "./quickMixPipeline.ts";
import { quickMixSourceLabel } from "./quickMixPipeline.ts";
import type { QuickMixFailureViewModel, QuickMixStepId } from "./quickMix.ts";
import { QUICK_MIX_PROGRESS_STEPS } from "./quickMix.ts";

export type QuickMixRecoveryTopic =
  | "sidecar"
  | "ffmpeg"
  | "rubberband"
  | "demucs"
  | "files"
  | "unknown";

export interface QuickMixPlainError {
  headline: string;
  detail: string;
  recoveryTopic: QuickMixRecoveryTopic;
  failedStepId: QuickMixStepId | null;
  failedSource: QuickMixSource | null;
  validationErrors: string[];
  statusCode: string | null;
  responseBody: string | null;
}

const RECOVERY_MESSAGES: Record<QuickMixRecoveryTopic, string> = {
  sidecar: "Start the local engine with npm run sidecar:start, then try Mix again.",
  ffmpeg: "Install FFmpeg to render the mix.",
  rubberband: "Install Rubber Band to adjust pitch/time.",
  demucs: "Install Demucs/PyTorch to separate stems.",
  files: "Choose two local audio files you own or are authorized to use.",
  unknown: "Check Advanced Studio for dependency details, then try again.",
};

export function mapQuickMixError(input: {
  message?: string | null;
  status?: string | null;
  setupGuidance?: string | null;
  validationErrors?: string[] | null;
  failedStepId?: QuickMixStepId | null;
  failedSource?: QuickMixSource | null;
  responseBody?: string | null;
}): QuickMixPlainError {
  const validationErrors = (input.validationErrors ?? []).filter(Boolean);
  const blob = [
    input.message ?? "",
    input.status ?? "",
    input.setupGuidance ?? "",
    ...validationErrors,
  ]
    .join(" ")
    .toLowerCase();

  const detailFromValidation =
    validationErrors.length > 0
      ? validationErrors.join(" ")
      : input.message?.trim() || input.setupGuidance?.trim() || null;

  let recoveryTopic: QuickMixRecoveryTopic = "unknown";
  if (/demucs|pytorch|torch|stem separation/.test(blob)) {
    recoveryTopic = "demucs";
  } else if (/rubber band|rubberband|pitch|time stretch/.test(blob)) {
    recoveryTopic = "rubberband";
  } else if (/ffmpeg|ffprobe/.test(blob)) {
    recoveryTopic = "ffmpeg";
  } else if (/offline|sidecar|127\.0\.0\.1:47831|not reachable|connection|local helper/.test(blob)) {
    recoveryTopic = "sidecar";
  } else if (/upload|file|empty|audio file/.test(blob)) {
    recoveryTopic = "files";
  }

  let headline = "Mix could not finish";
  if (input.failedSource) {
    const sourceLabel = quickMixSourceLabel(input.failedSource);
    if (input.failedStepId === "separating_vocal" || input.failedStepId === "preparing_instrumental") {
      headline = `${sourceLabel} — stem separation failed`;
    } else if (input.failedStepId === "creating_wav_export") {
      headline = `${sourceLabel} — WAV export failed`;
    }
  } else if (input.failedStepId === "checking_files") {
    headline = "Setup check failed";
  } else if (input.failedStepId === "matching_timing") {
    headline = "Timing/key matching failed";
  } else if (input.failedStepId === "mixing_track") {
    headline = "Mix rendering failed";
  } else if (input.failedStepId === "creating_wav_export") {
    headline = "WAV export failed";
  } else if (input.failedStepId === "creating_mp3_reference") {
    headline = "MP3 reference failed";
  }

  if (validationErrors.some((line) => /max_preview_seconds/.test(line))) {
    headline = input.failedSource
      ? `${quickMixSourceLabel(input.failedSource)} — preview length rejected`
      : "Stem preview settings rejected";
  }

  const detail =
    detailFromValidation && !/failed validation$/i.test(detailFromValidation)
      ? detailFromValidation
      : detailFromValidation
        ? `${detailFromValidation}${validationErrors.length ? `: ${validationErrors.join(" ")}` : ""}`
        : RECOVERY_MESSAGES[recoveryTopic];

  return {
    headline,
    detail,
    recoveryTopic,
    failedStepId: input.failedStepId ?? null,
    failedSource: input.failedSource ?? null,
    validationErrors,
    statusCode: input.status ?? null,
    responseBody: input.responseBody ?? null,
  };
}

export function mapQuickMixException(error: unknown): QuickMixPlainError {
  if (error instanceof Error) {
    return mapQuickMixError({ message: error.message });
  }
  return mapQuickMixError({ message: String(error) });
}

export function mapQuickMixDependencyFailure(
  missingLabels: string[],
  failedStepId: QuickMixStepId = "checking_files"
): QuickMixPlainError {
  return mapQuickMixError({
    message: `Setup needed: ${missingLabels.join(", ")}.`,
    status: "setup_needed",
    failedStepId,
    validationErrors: missingLabels.map((label) => `${label} is not ready.`),
  });
}

export function mapQuickMixStemFailure(
  result: {
    message?: string | null;
    status?: string | null;
    setupGuidance?: string | null;
    validationErrors?: string[];
  },
  source: QuickMixSource
): QuickMixPlainError {
  return mapQuickMixError({
    message: result.message,
    status: result.status,
    setupGuidance: result.setupGuidance,
    validationErrors: result.validationErrors,
    failedStepId: source === "vocal" ? "separating_vocal" : "preparing_instrumental",
    failedSource: source,
    responseBody: JSON.stringify(result, null, 2),
  });
}

export function mapQuickMixExportFailure(
  result: {
    message?: string | null;
    status?: string | null;
    setupGuidance?: string | null;
    validationErrors?: string[] | null;
  },
  stepId: "creating_wav_export" | "creating_mp3_reference"
): QuickMixPlainError {
  return mapQuickMixError({
    message: result.message,
    status: result.status,
    setupGuidance: result.setupGuidance,
    validationErrors: result.validationErrors ?? undefined,
    failedStepId: stepId,
    responseBody: JSON.stringify(result, null, 2),
  });
}

export function recoveryMessageForTopic(topic: QuickMixRecoveryTopic): string {
  return RECOVERY_MESSAGES[topic];
}

export function buildQuickMixFailureView(error: QuickMixPlainError): QuickMixFailureViewModel {
  const failedStep = error.failedStepId
    ? QUICK_MIX_PROGRESS_STEPS.find((step) => step.id === error.failedStepId)
    : null;
  return {
    headline: error.headline,
    detail: error.detail,
    recovery: recoveryMessageForTopic(error.recoveryTopic),
    failedStepLabel: failedStep?.label ?? null,
    failedSourceLabel: error.failedSource ? quickMixSourceLabel(error.failedSource) : null,
    validationErrors: error.validationErrors,
    statusCode: error.statusCode,
    responseBody: error.responseBody,
  };
}

function plainError(
  headline: string,
  detail: string,
  recoveryTopic: QuickMixRecoveryTopic
): QuickMixPlainError {
  return {
    headline,
    detail,
    recoveryTopic,
    failedStepId: null,
    failedSource: null,
    validationErrors: [],
    statusCode: null,
    responseBody: null,
  };
}

export function mapQuickMixErrorLegacy(input: {
  message?: string | null;
  status?: string | null;
  setupGuidance?: string | null;
}): QuickMixPlainError {
  return mapQuickMixError(input);
}

export { plainError };
