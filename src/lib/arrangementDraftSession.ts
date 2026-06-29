import type { AppliedDraftSettings } from "../domain/arrangementPlanning.ts";
import type { DraftType } from "../domain/arrangementPlanning.ts";
import { parseDraftType } from "../domain/arrangementPlanning.ts";

const SELECTED_DRAFT_KEY = "mashlab-arrangement-draft-v1";
const APPLIED_DRAFT_KEY = "mashlab-arrangement-applied-v1";

export function loadSelectedDraftType(): DraftType {
  if (typeof window === "undefined" || !window.localStorage) {
    return "clean_blend";
  }

  const raw = window.localStorage.getItem(SELECTED_DRAFT_KEY);
  return parseDraftType(raw ?? "") ?? "clean_blend";
}

export function saveSelectedDraftType(draftType: DraftType): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(SELECTED_DRAFT_KEY, draftType);
}

export function loadAppliedDraftSettings(): AppliedDraftSettings | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem(APPLIED_DRAFT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppliedDraftSettings;
  } catch {
    return null;
  }
}

export function saveAppliedDraftSettings(settings: AppliedDraftSettings): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(APPLIED_DRAFT_KEY, JSON.stringify(settings));
}

export function clearAppliedDraftSettings(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(APPLIED_DRAFT_KEY);
}
