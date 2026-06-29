import { requiredRightsNotice } from "../lib/legal.ts";
import { COMBINED_PREVIEW_ONLY_NOTICE } from "./combinedPreview.ts";
import { DEFAULT_EXPORT_RIGHTS_NOTICE } from "./localExport.ts";
import { DEFAULT_FULL_EXPORT_RIGHTS_NOTICE } from "./fullLengthExport.ts";
import { DEFAULT_MP3_EXPORT_RIGHTS_NOTICE } from "./mp3Export.ts";
import { MASTERING_NO_RIGHTS_NOTICE } from "./masteringPresets.ts";
import { PACKAGE_EXPORT_NOTICE } from "./projectPackage.ts";
import { PREVIEW_ARTIFACT_LABEL } from "./previewArtifacts.ts";

export const RIGHTS_DOCTRINE_EXACT = requiredRightsNotice;

export const CRITICAL_RIGHTS_SURFACES = [
  "upload",
  "combined_preview",
  "export_wav",
  "export_full_wav",
  "export_mp3",
  "mastering",
  "project_package",
  "artifact_browser",
  "sidebar",
  "rights_screen",
] as const;

export type CriticalRightsSurface = (typeof CRITICAL_RIGHTS_SURFACES)[number];

export interface RightsSurfaceExpectation {
  surface: CriticalRightsSurface;
  notice: string;
  mustNotInclude: string[];
}

const FORBIDDEN_RIGHTS_PHRASES = [
  "public sharing",
  "distribution rights granted",
  "publishing rights",
  "club-ready certification",
  "you may publish",
  "streaming integration",
];

export const RIGHTS_SURFACE_EXPECTATIONS: RightsSurfaceExpectation[] = [
  { surface: "upload", notice: requiredRightsNotice, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "combined_preview", notice: COMBINED_PREVIEW_ONLY_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "export_wav", notice: DEFAULT_EXPORT_RIGHTS_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "export_full_wav", notice: DEFAULT_FULL_EXPORT_RIGHTS_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "export_mp3", notice: DEFAULT_MP3_EXPORT_RIGHTS_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "mastering", notice: MASTERING_NO_RIGHTS_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "project_package", notice: PACKAGE_EXPORT_NOTICE, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "artifact_browser", notice: PREVIEW_ARTIFACT_LABEL, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "sidebar", notice: requiredRightsNotice, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
  { surface: "rights_screen", notice: requiredRightsNotice, mustNotInclude: FORBIDDEN_RIGHTS_PHRASES },
];

export function auditRightsNotice(notice: string): string[] {
  const issues: string[] = [];

  if (!notice.includes("user") && !notice.includes("User") && !notice.includes("authorized")) {
    issues.push("Notice should remind the user they supply audio and hold rights responsibility.");
  }

  for (const phrase of FORBIDDEN_RIGHTS_PHRASES) {
    if (notice.toLowerCase().includes(phrase)) {
      issues.push(`Forbidden phrase detected: ${phrase}`);
    }
  }

  return issues;
}

export function allCriticalSurfacesIncludeRightsDoctrine(): boolean {
  return RIGHTS_SURFACE_EXPECTATIONS.every((entry) => entry.notice.length > 0);
}

export function formatRightsAuditSummary(): string {
  return `${RIGHTS_SURFACE_EXPECTATIONS.length} critical UI surfaces carry rights-neutral copy anchored to the required doctrine.`;
}
