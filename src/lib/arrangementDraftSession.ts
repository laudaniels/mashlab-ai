import type { AppliedDraftSettings } from "../domain/arrangementPlanning.ts";
import type { DraftType } from "../domain/arrangementPlanning.ts";
import { parseDraftType } from "../domain/arrangementPlanning.ts";
import type {
  SectionPreviewBinding,
  SelectedArrangementSection,
} from "../domain/arrangementSectionBinding.ts";
import type { ArrangementSectionContext } from "../domain/arrangementSectionContext.ts";

const SELECTED_DRAFT_KEY = "mashlab-arrangement-draft-v1";
const APPLIED_DRAFT_KEY = "mashlab-arrangement-applied-v1";
const SELECTED_SECTION_KEY = "mashlab-arrangement-section-v1";
const SECTION_BINDING_KEY = "mashlab-arrangement-section-binding-v1";
const SECTION_CONTEXT_KEY = "mashlab-arrangement-section-context-v1";

function getBrowserStorage(): Storage | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage ?? null;
}

export function loadSelectedDraftType(): DraftType {
  const storage = getBrowserStorage();
  if (!storage) {
    return "clean_blend";
  }

  const raw = storage.getItem(SELECTED_DRAFT_KEY);
  return parseDraftType(raw ?? "") ?? "clean_blend";
}

export function saveSelectedDraftType(draftType: DraftType): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SELECTED_DRAFT_KEY, draftType);
}

export function loadAppliedDraftSettings(): AppliedDraftSettings | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(APPLIED_DRAFT_KEY);
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
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(APPLIED_DRAFT_KEY, JSON.stringify(settings));
}

export function clearAppliedDraftSettings(): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(APPLIED_DRAFT_KEY);
}

export function loadSelectedArrangementSection(): SelectedArrangementSection | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SELECTED_SECTION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SelectedArrangementSection;
  } catch {
    return null;
  }
}

export function saveSelectedArrangementSection(section: SelectedArrangementSection): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SELECTED_SECTION_KEY, JSON.stringify(section));
}

export function loadSectionPreviewBinding(): SectionPreviewBinding | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SECTION_BINDING_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SectionPreviewBinding;
  } catch {
    return null;
  }
}

export function saveSectionPreviewBinding(binding: SectionPreviewBinding): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SECTION_BINDING_KEY, JSON.stringify(binding));
}

export function clearSectionPreviewBinding(): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(SECTION_BINDING_KEY);
  storage.removeItem(SELECTED_SECTION_KEY);
  storage.removeItem(SECTION_CONTEXT_KEY);
}

export function loadArrangementSectionContext(): ArrangementSectionContext | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SECTION_CONTEXT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ArrangementSectionContext;
  } catch {
    return null;
  }
}

export function saveArrangementSectionContext(context: ArrangementSectionContext): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SECTION_CONTEXT_KEY, JSON.stringify(context));
}

export type PreviewConfigurationSource =
  | { source: "section_binding"; binding: SectionPreviewBinding }
  | { source: "draft_applied"; settings: AppliedDraftSettings };

export function loadPreviewConfigurationSource(): PreviewConfigurationSource | null {
  const binding = loadSectionPreviewBinding();
  if (binding) {
    return { source: "section_binding", binding };
  }

  const applied = loadAppliedDraftSettings();
  if (applied) {
    return { source: "draft_applied", settings: applied };
  }

  return null;
}
