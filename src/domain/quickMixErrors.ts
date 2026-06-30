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
}): QuickMixPlainError {
  const blob = `${input.message ?? ""} ${input.status ?? ""} ${input.setupGuidance ?? ""}`.toLowerCase();

  if (/demucs|pytorch|torch|stem separation/.test(blob)) {
    return plainError("Stem separation needs setup", RECOVERY_MESSAGES.demucs, "demucs");
  }
  if (/rubber band|rubberband|pitch|time stretch/.test(blob)) {
    return plainError("Pitch/time adjustment needs setup", RECOVERY_MESSAGES.rubberband, "rubberband");
  }
  if (/ffmpeg|ffprobe/.test(blob)) {
    return plainError("Audio rendering needs FFmpeg", RECOVERY_MESSAGES.ffmpeg, "ffmpeg");
  }
  if (/offline|sidecar|127\.0\.0\.1:47831|not reachable|connection/.test(blob)) {
    return plainError("Local engine is not running", RECOVERY_MESSAGES.sidecar, "sidecar");
  }
  if (/upload|file|empty|audio file/.test(blob)) {
    return plainError("Check your song files", RECOVERY_MESSAGES.files, "files");
  }

  return plainError(
    "Mix could not finish",
    input.message?.trim() || RECOVERY_MESSAGES.unknown,
    "unknown"
  );
}

export function mapQuickMixException(error: unknown): QuickMixPlainError {
  if (error instanceof Error) {
    return mapQuickMixError({ message: error.message });
  }
  return mapQuickMixError({ message: String(error) });
}

export function recoveryMessageForTopic(topic: QuickMixRecoveryTopic): string {
  return RECOVERY_MESSAGES[topic];
}

function plainError(
  headline: string,
  detail: string,
  recoveryTopic: QuickMixRecoveryTopic
): QuickMixPlainError {
  return { headline, detail, recoveryTopic };
}
