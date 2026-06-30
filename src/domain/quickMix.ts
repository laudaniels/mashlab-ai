import { requiredRightsNotice } from "../lib/legal.ts";
import type { MixSettings } from "./mixControls.ts";

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

export const QUICK_MIX_DEFAULT_MIX_SETTINGS: MixSettings = {
  vocalGainDb: 0,
  instrumentalGainDb: 0,
  masterGainDb: 0,
  vocalFadeInMs: 0,
  vocalFadeOutMs: 0,
  instrumentalFadeInMs: 0,
  instrumentalFadeOutMs: 0,
  limiterSafety: true,
  clippingGuard: true,
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
  instrumentalFile: File | null;
  instrumentalFileName: string | null;
}

export interface QuickMixOutputModel {
  wavPlaybackUrl: string | null;
  wavDownloadUrl: string | null;
  mp3PlaybackUrl: string | null;
  mp3DownloadUrl: string | null;
  exportLabel: string;
  timingNotice: string;
  wavArtifactId: string | null;
  mp3ArtifactId: string | null;
  durationSeconds: number | null;
  technicalSummary: string[];
  mp3SkippedReason: string | null;
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
    instrumentalFile: null,
    instrumentalFileName: null,
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
  return validateQuickMixUploads(state).ok && readyToMix;
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

export function markQuickMixStepFailed(
  steps: QuickMixProgressStep[],
  failedId: QuickMixStepId
): QuickMixProgressStep[] {
  return steps.map((step) => {
    if (step.id === failedId) {
      return { ...step, status: "failed" };
    }
    if (step.status === "active") {
      return { ...step, status: "pending" };
    }
    return step;
  });
}

export function completeQuickMixProgress(steps: QuickMixProgressStep[]): QuickMixProgressStep[] {
  return steps.map((step) => ({ ...step, status: "complete" as const }));
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
