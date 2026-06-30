import type { QuickMixSource } from "./quickMixPipeline.ts";
import { quickMixSourceLabel } from "./quickMixPipeline.ts";
import type { QuickMixFailureViewModel, QuickMixStepId } from "./quickMix.ts";
import { QUICK_MIX_MP3_FAILED_AFTER_WAV, QUICK_MIX_PROGRESS_STEPS } from "./quickMix.ts";

export type QuickMixRecoveryTopic =
  | "sidecar"
  | "ffmpeg"
  | "rubberband"
  | "demucs"
  | "files"
  | "timeout"
  | "unknown";

export interface QuickMixErrorContext {
  demucsAvailable?: boolean;
  noResponse?: boolean;
  timedOut?: boolean;
}

export interface QuickMixPlainError {
  headline: string;
  detail: string;
  recoveryMessage: string;
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
  timeout:
    "Stem separation can take several minutes on CPU. Check that the sidecar is still running, then try Mix again.",
  unknown: "Check Advanced Studio for dependency details, then try again.",
};

const STEM_NO_RESPONSE_DETAIL =
  "The local engine did not respond while separating this track.";

export function mapQuickMixError(input: {
  message?: string | null;
  status?: string | null;
  setupGuidance?: string | null;
  validationErrors?: string[] | null;
  failedStepId?: QuickMixStepId | null;
  failedSource?: QuickMixSource | null;
  responseBody?: string | null;
  context?: QuickMixErrorContext;
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

  const context = input.context ?? {};
  let recoveryTopic: QuickMixRecoveryTopic = "unknown";

  if (context.noResponse || context.timedOut || input.status === "no_response" || input.status === "timeout") {
    recoveryTopic = "timeout";
  } else if (input.status === "missing_dependency") {
    if (/demucs|pytorch|torch/.test(blob) && context.demucsAvailable !== true) {
      recoveryTopic = "demucs";
    } else if (/ffmpeg|ffprobe/.test(blob)) {
      recoveryTopic = "ffmpeg";
    } else if (/rubber band|rubberband/.test(blob)) {
      recoveryTopic = "rubberband";
    }
  } else if (/offline|sidecar|127\.0\.0\.1:47831|not reachable|connection|local helper/.test(blob)) {
    recoveryTopic = "sidecar";
  } else if (/rubber band|rubberband|pitch|time stretch/.test(blob)) {
    recoveryTopic = "rubberband";
  } else if (/ffmpeg|ffprobe/.test(blob)) {
    recoveryTopic = "ffmpeg";
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

  let detail =
    validationErrors.length > 0
      ? validationErrors.join(" ")
      : input.message?.trim() || input.setupGuidance?.trim() || "Mix could not finish.";

  if (context.noResponse || context.timedOut) {
    detail = STEM_NO_RESPONSE_DETAIL;
  } else if (input.status === "processing_failed" && input.setupGuidance?.trim()) {
    detail = input.setupGuidance.trim();
  }

  const recoveryMessage = RECOVERY_MESSAGES[recoveryTopic];

  return {
    headline,
    detail,
    recoveryMessage,
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
    const timedOut = /timeout|aborted|abort/i.test(error.message);
    return mapQuickMixError({
      message: error.message,
      status: timedOut ? "timeout" : null,
      context: { timedOut, noResponse: timedOut },
    });
  }
  return mapQuickMixError({ message: String(error) });
}

export function mapQuickMixDependencyFailure(
  missingLabels: string[],
  failedStepId: QuickMixStepId = "checking_files",
  context?: QuickMixErrorContext
): QuickMixPlainError {
  return mapQuickMixError({
    message: `Setup needed: ${missingLabels.join(", ")}.`,
    status: "setup_needed",
    failedStepId,
    validationErrors: missingLabels.map((label) => `${label} is not ready.`),
    context,
  });
}

export function mapQuickMixSidecarFailure(
  message: string,
  failedStepId: QuickMixStepId
): QuickMixPlainError {
  const mapped = mapQuickMixError({
    message,
    status: "sidecar_offline",
    failedStepId,
  });
  return {
    ...mapped,
    recoveryTopic: "sidecar",
    recoveryMessage: RECOVERY_MESSAGES.sidecar,
  };
}

export function mapQuickMixNoResponseStemFailure(
  source: QuickMixSource,
  context?: QuickMixErrorContext
): QuickMixPlainError {
  return mapQuickMixError({
    message: STEM_NO_RESPONSE_DETAIL,
    status: "no_response",
    failedStepId: source === "vocal" ? "separating_vocal" : "preparing_instrumental",
    failedSource: source,
    context: { noResponse: true, ...context },
  });
}

export function mapQuickMixStemFailure(
  result: {
    message?: string | null;
    status?: string | null;
    setupGuidance?: string | null;
    validationErrors?: string[];
  },
  source: QuickMixSource,
  context?: QuickMixErrorContext
): QuickMixPlainError {
  return mapQuickMixError({
    message: result.message,
    status: result.status,
    setupGuidance: result.setupGuidance,
    validationErrors: result.validationErrors,
    failedStepId: source === "vocal" ? "separating_vocal" : "preparing_instrumental",
    failedSource: source,
    responseBody: JSON.stringify(result, null, 2),
    context,
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
    recovery: error.recoveryMessage,
    failedStepLabel: failedStep?.label ?? null,
    failedSourceLabel: error.failedSource ? quickMixSourceLabel(error.failedSource) : null,
    validationErrors: error.validationErrors,
    statusCode: error.statusCode,
    responseBody: error.responseBody,
  };
}

export function mp3SkippedMessageAfterWavSuccess(reason: string | null): string {
  return reason ? `${QUICK_MIX_MP3_FAILED_AFTER_WAV} ${reason}` : QUICK_MIX_MP3_FAILED_AFTER_WAV;
}
