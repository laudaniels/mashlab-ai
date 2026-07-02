import { requiredRightsNotice } from "../lib/legal.ts";
import type { MixSettings } from "./mixControls.ts";
import type { QuickMixRemixBrainCard } from "./remixBrain.ts";
import type { QuickMixArrangementCard } from "./arrangementBrain.ts";

export const QUICK_MIX_PROMISE =
  "Drop two songs. MashLab mixes them locally on your machine — no cloud upload.";

export const QUICK_MIX_VOCAL_DROP_LABEL = "Vocal / Acapella Source";
export const QUICK_MIX_VOCAL_DROP_HINT = "Drop the song you want the vocal from.";
export const QUICK_MIX_BEAT_DROP_LABEL = "Instrumental / Beat Source";
export const QUICK_MIX_BEAT_DROP_HINT = "Drop the song you want the beat/instrumental from.";

export const QUICK_MIX_PRIMARY_ACTION = "Mix";
export const QUICK_MIX_ADVANCED_STUDIO_LABEL = "Advanced Studio";

export const QUICK_MIX_OUTPUT_LABEL =
  "Local mix export — user responsible for rights.";

export const QUICK_MIX_NEUTRAL_TIMING_NOTICE =
  "No tempo/key correction applied — neutral mix settings used.";

export const QUICK_MIX_LOCAL_ONLY_NOTICE =
  "All processing stays on your machine. No public sharing or cloud upload.";

export const QUICK_MIX_STEM_ACTIVE_HINT =
  "Stem separation on CPU may take several minutes per song. Leave this tab open — processing has not stopped.";

export const QUICK_MIX_EXPORT_ACTIVE_HINT =
  "Creating your local mix export — this step is usually faster than stem separation.";

/** Steps that run heavy local CPU work and can legitimately take minutes. */
export const QUICK_MIX_LONG_RUNNING_STEP_IDS = [
  "separating_vocal",
  "preparing_instrumental",
] as const;

export function isQuickMixLongRunningStep(stepId: QuickMixStepId): boolean {
  return (QUICK_MIX_LONG_RUNNING_STEP_IDS as readonly QuickMixStepId[]).includes(stepId);
}

export function formatQuickMixElapsed(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function quickMixLongRunningHeartbeat(
  stepId: QuickMixStepId,
  elapsedSeconds: number
): string | null {
  if (!isQuickMixLongRunningStep(stepId)) {
    return null;
  }
  const source = stepId === "separating_vocal" ? "vocals" : "the instrumental";
  return `Still separating ${source}… ${formatQuickMixElapsed(elapsedSeconds)} elapsed. CPU stem separation can take several minutes — this has not stopped.`;
}

export const QUICK_MIX_DURATION_CAP_SECONDS = 180;

export const QUICK_MIX_DURATION_CAP_NOTICE =
  "Quick Mix processes up to 180 seconds (3:00) per source — longer files are shortened automatically. Default is First 3:00, or choose a custom start. Not a full-length song export.";

export const QUICK_MIX_SOURCE_PREPARING_LABEL = "Reading audio…";

export const QUICK_MIX_MP3_FAILED_AFTER_WAV =
  "WAV created. MP3 reference failed — download the WAV above.";

export const QUICK_MIX_DEFAULT_MIX_SETTINGS: MixSettings = {
  vocalGainDb: 1.5,
  instrumentalGainDb: -3,
  masterGainDb: -1,
  vocalFadeInMs: 0,
  vocalFadeOutMs: 0,
  instrumentalFadeInMs: 0,
  instrumentalFadeOutMs: 0,
  limiterSafety: true,
  clippingGuard: true,
  instrumentalDuckUnderVocal: true,
};

export type QuickMixStepId =
  | "checking_files"
  | "separating_vocal"
  | "preparing_instrumental"
  | "matching_timing"
  | "mixing_track"
  | "creating_wav_export"
  | "creating_mp3_reference"
  | "done";

export interface QuickMixProgressStep {
  id: QuickMixStepId;
  label: string;
  status: "pending" | "active" | "complete" | "failed";
}

export const QUICK_MIX_PROGRESS_STEPS: readonly { id: QuickMixStepId; label: string }[] = [
  { id: "checking_files", label: "Checking files" },
  { id: "separating_vocal", label: "Separating vocal" },
  { id: "preparing_instrumental", label: "Preparing instrumental" },
  { id: "matching_timing", label: "Matching timing/key" },
  { id: "mixing_track", label: "Mixing track" },
  { id: "creating_wav_export", label: "Creating WAV export" },
  { id: "creating_mp3_reference", label: "Creating MP3 reference" },
  { id: "done", label: "Done" },
];

export type QuickMixUploadSlot = "vocal" | "instrumental";

export interface QuickMixUploadState {
  vocalFile: File | null;
  vocalFileName: string | null;
  vocalPreparing: boolean;
  instrumentalFile: File | null;
  instrumentalFileName: string | null;
  instrumentalPreparing: boolean;
}

export interface QuickMixOutputModel {
  wavPlaybackUrl: string | null;
  wavDownloadUrl: string | null;
  mp3PlaybackUrl: string | null;
  mp3DownloadUrl: string | null;
  exportLabel: string;
  timingNotice: string;
  durationCapNotice: string | null;
  sectionNotice: string | null;
  sectionSummaryLines: string[];
  wavArtifactId: string | null;
  mp3ArtifactId: string | null;
  durationSeconds: number | null;
  mixProfileSummary: string;
  loudnessNotice: string | null;
  loudnessWarnings: string[];
  listeningComparisonNotes: string[];
  technicalSummary: string[];
  mp3SkippedReason: string | null;
  remixBrainCard: QuickMixRemixBrainCard | null;
  arrangementCard: QuickMixArrangementCard | null;
}

export interface QuickMixFailureViewModel {
  headline: string;
  detail: string;
  recovery: string;
  failedStepLabel: string | null;
  failedSourceLabel: string | null;
  validationErrors: string[];
  statusCode: string | null;
  responseBody: string | null;
}

export type AppExperienceMode = "quick-mix" | "advanced-studio";

export const APP_MODE_STORAGE_KEY = "mashlab-app-experience-mode";

export function createInitialQuickMixUploadState(): QuickMixUploadState {
  return {
    vocalFile: null,
    vocalFileName: null,
    vocalPreparing: false,
    instrumentalFile: null,
    instrumentalFileName: null,
    instrumentalPreparing: false,
  };
}

export function createInitialQuickMixProgress(): QuickMixProgressStep[] {
  return QUICK_MIX_PROGRESS_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    status: "pending",
  }));
}

export function validateQuickMixUploads(state: QuickMixUploadState): {
  ok: boolean;
  message: string | null;
} {
  if (!state.vocalFile) {
    return { ok: false, message: "Add a vocal or acapella source song first." };
  }
  if (!state.instrumentalFile) {
    return { ok: false, message: "Add an instrumental or beat source song first." };
  }
  return { ok: true, message: null };
}

export function canStartQuickMix(state: QuickMixUploadState, readyToMix: boolean): boolean {
  return (
    validateQuickMixUploads(state).ok &&
    readyToMix &&
    !state.vocalPreparing &&
    !state.instrumentalPreparing
  );
}

export function advanceQuickMixStep(
  steps: QuickMixProgressStep[],
  activeId: QuickMixStepId,
  status: QuickMixProgressStep["status"] = "active"
): QuickMixProgressStep[] {
  let passedActive = false;
  return steps.map((step) => {
    if (step.id === activeId) {
      passedActive = true;
      return { ...step, status };
    }
    if (!passedActive && step.status !== "failed") {
      return { ...step, status: "complete" };
    }
    if (passedActive && step.status === "pending" && status !== "failed") {
      return step;
    }
    return step;
  });
}

export function failQuickMixProgress(
  steps: QuickMixProgressStep[],
  failedId: QuickMixStepId
): QuickMixProgressStep[] {
  const failedIndex = steps.findIndex((step) => step.id === failedId);
  if (failedIndex < 0) {
    return steps;
  }

  return steps.map((step, index) => {
    if (index < failedIndex) {
      return step.status === "complete" || step.status === "active"
        ? { ...step, status: "complete" as const }
        : step;
    }
    if (index === failedIndex) {
      return { ...step, status: "failed" as const };
    }
    return { ...step, status: "pending" as const };
  });
}

export function succeedQuickMixProgress(steps: QuickMixProgressStep[]): QuickMixProgressStep[] {
  return steps.map((step) => ({ ...step, status: "complete" as const }));
}

export function quickMixProgressStepHint(
  stepId: QuickMixStepId,
  status: QuickMixProgressStep["status"]
): string | null {
  if (status !== "active") {
    return null;
  }
  if (stepId === "separating_vocal" || stepId === "preparing_instrumental") {
    return QUICK_MIX_STEM_ACTIVE_HINT;
  }
  if (stepId === "creating_wav_export" || stepId === "creating_mp3_reference") {
    return QUICK_MIX_EXPORT_ACTIVE_HINT;
  }
  return null;
}

export function buildQuickMixDurationCapNotice(
  vocalDurationSeconds: number | null,
  instrumentalDurationSeconds: number | null
): string | null {
  const exceedsCap =
    (vocalDurationSeconds !== null && vocalDurationSeconds > QUICK_MIX_DURATION_CAP_SECONDS) ||
    (instrumentalDurationSeconds !== null && instrumentalDurationSeconds > QUICK_MIX_DURATION_CAP_SECONDS);
  return exceedsCap ? QUICK_MIX_DURATION_CAP_NOTICE : null;
}

export function quickMixPipelineShowsDone(steps: QuickMixProgressStep[]): boolean {
  const doneStep = steps.find((step) => step.id === "done");
  return doneStep?.status === "complete";
}

export function markQuickMixStepFailed(
  steps: QuickMixProgressStep[],
  failedId: QuickMixStepId
): QuickMixProgressStep[] {
  return failQuickMixProgress(steps, failedId);
}

/** @deprecated Use succeedQuickMixProgress after WAV export succeeds. */
export function completeQuickMixProgress(steps: QuickMixProgressStep[]): QuickMixProgressStep[] {
  return succeedQuickMixProgress(steps);
}

export function includesQuickMixRightsLanguage(text: string): boolean {
  return (
    text.includes(requiredRightsNotice) &&
    /authorized to use|user's responsibility/i.test(text) &&
    /no public sharing|local-only|local only|no cloud upload/i.test(text)
  );
}

export function includesNoPublicSharingInQuickMixCopy(text: string): boolean {
  return /no public sharing|no cloud upload|local-only|local only|not publish-ready|not professionally mastered/i.test(
    text
  );
}

export function loadAppExperienceMode(storage?: Pick<Storage, "getItem">): AppExperienceMode {
  const backing = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!backing?.getItem) {
    return "quick-mix";
  }
  const stored = backing.getItem(APP_MODE_STORAGE_KEY);
  return stored === "advanced-studio" ? "advanced-studio" : "quick-mix";
}

export function saveAppExperienceMode(
  mode: AppExperienceMode,
  storage?: Pick<Storage, "setItem">
): void {
  const backing = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!backing?.setItem) {
    return;
  }
  backing.setItem(APP_MODE_STORAGE_KEY, mode);
}
