import { requiredRightsNotice } from "../lib/legal.ts";
import { RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE } from "./rhythmSelfTest.ts";
import { WSL_OPTIONAL_RHYTHM_NOTICE, WINDOWS_MVP_RHYTHM_NOTICE } from "./wslSidecarProfile.ts";

export type DependencyRequirementTier =
  | "browser_mvp"
  | "processing"
  | "optional_analysis"
  | "wsl_optional";

export type WindowsRuntimeCheckStatus = "available" | "missing" | "optional_missing" | "unknown";

export interface WindowsRuntimeCheckItem {
  id: string;
  label: string;
  tier: DependencyRequirementTier;
  status: WindowsRuntimeCheckStatus;
  message: string;
  setupGuidance: string | null;
}

export interface FirstRunStep {
  id: string;
  stepNumber: number;
  label: string;
  detail: string;
  screenId: "upload" | "analysis" | "stems" | "timeline" | "export";
}

export const LOCAL_ONLY_PROCESSING_NOTICE =
  "All processing stays on your machine. No cloud upload, public sharing, or streaming import.";

export const WINDOWS_FFMPEG_PATH_NOTICE =
  "FFmpeg and ffprobe must be on PATH for stem preview, combined preview, export, and loudness readout. The browser MVP upload screen works without them.";

export const WINDOWS_PYTHON_PATH_NOTICE =
  "Python 3.10+ on PATH is required to run the optional local sidecar at 127.0.0.1:47831.";

export const STREAMLABS_FFMPEG_NOTE =
  "Streamlabs or other bundled FFmpeg builds may work temporarily for verification, but install a standard FFmpeg release and add its bin folder to PATH for a permanent setup.";

export const FIRST_RUN_DISMISS_KEY = "mashlab-first-run-guidance-dismissed";

export const FIRST_RUN_STEPS: readonly FirstRunStep[] = [
  {
    id: "upload",
    stepNumber: 1,
    label: "Load two tracks",
    detail: "Upload audio you own or are authorized to use. Files stay in this browser session.",
    screenId: "upload",
  },
  {
    id: "analysis",
    stepNumber: 2,
    label: "Run analysis or enter DJ overrides",
    detail: "Optional sidecar + librosa for BPM/key prototypes. Overrides always available.",
    screenId: "analysis",
  },
  {
    id: "stems",
    stepNumber: 3,
    label: "Create stem previews",
    detail: "Requires sidecar, FFmpeg, and Demucs. User-initiated only.",
    screenId: "stems",
  },
  {
    id: "combined",
    stepNumber: 4,
    label: "Create combined preview",
    detail: "Requires stem previews on both tracks and Rubber Band for pitch/time.",
    screenId: "timeline",
  },
  {
    id: "export",
    stepNumber: 5,
    label: "Export or package locally",
    detail: "WAV/MP3/master/package artifacts stay local. No distribution rights granted.",
    screenId: "export",
  },
];

export const DEPENDENCY_TIER_LABELS: Record<DependencyRequirementTier, string> = {
  browser_mvp: "Browser MVP (no sidecar required)",
  processing: "Required for local processing / export",
  optional_analysis: "Optional analysis prototype",
  wsl_optional: "Optional WSL/Linux advanced rhythm",
};

export const DEPENDENCY_TIER_ORDER: DependencyRequirementTier[] = [
  "browser_mvp",
  "processing",
  "optional_analysis",
  "wsl_optional",
];

export function formatDependencyTierLabel(tier: DependencyRequirementTier): string {
  return DEPENDENCY_TIER_LABELS[tier];
}

export function formatWindowsRuntimeCheckLine(item: WindowsRuntimeCheckItem): string {
  return `${item.label}: ${item.status.replace(/_/g, " ")} — ${item.message}`;
}

export function formatWindowsRuntimeSummary(items: WindowsRuntimeCheckItem[]): string {
  const available = items.filter((item) => item.status === "available").length;
  return `${available}/${items.length} runtime checks available`;
}

export function evaluateWindowsCheckExitCode(
  items: WindowsRuntimeCheckItem[],
  strict: boolean
): number {
  if (!strict) {
    return 0;
  }
  const blocking = items.filter(
    (item) =>
      item.tier === "processing" &&
      (item.id === "ffmpeg" || item.id === "python") &&
      item.status !== "available"
  );
  return blocking.length > 0 ? 1 : 0;
}

export function buildLocalStartChecklist(): string[] {
  return [
    "1. Terminal A — Vite app: npm install && npm run dev",
    "2. Terminal B — Sidecar (optional): cd local-engine/service",
    "   python -m venv .venv && .venv\\Scripts\\activate (Windows)",
    "   pip install -r requirements.txt && pip install -r requirements-analysis.txt",
    "   python -m uvicorn main:app --host 127.0.0.1 --port 47831",
    "3. Verify PATH: npm run setup:windows:check",
    "4. Optional stems: pip install -r requirements-stems.txt (Demucs + PyTorch)",
    "5. Optional Rubber Band: install rubberband-cli and add to PATH",
    "6. Optional WSL rhythm: npm run sidecar:wsl:check (advanced verified downbeats only)",
    "7. Open http://127.0.0.1:5173 — load two tracks and follow the session checklist",
    LOCAL_ONLY_PROCESSING_NOTICE,
    requiredRightsNotice,
  ];
}

export function firstRunPanelLines(): string[] {
  return [
    ...FIRST_RUN_STEPS.map((step) => `Step ${step.stepNumber}: ${step.label} — ${step.detail}`),
    LOCAL_ONLY_PROCESSING_NOTICE,
    requiredRightsNotice,
    WINDOWS_MVP_RHYTHM_NOTICE,
    WSL_OPTIONAL_RHYTHM_NOTICE,
  ];
}

export function dependencyRequirementExplanation(tier: DependencyRequirementTier): string {
  switch (tier) {
    case "browser_mvp":
      return "Works in the browser without FFmpeg or the Python sidecar.";
    case "processing":
      return "Needed for mix, export, stem preview, and pitch/time processing lanes.";
    case "optional_analysis":
      return "Improves BPM/key and heuristic phrase planning when installed in the sidecar venv.";
    case "wsl_optional":
      return "Only for optional madmom/Essentia verified rhythm — not required on Windows MVP.";
    default:
      return "";
  }
}

export function includesNoPublicSharingLanguage(text: string): boolean {
  return /no public sharing|public sharing|cloud upload|streaming import/i.test(text);
}

export function isFirstRunDismissed(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(FIRST_RUN_DISMISS_KEY) === "true";
}

export function dismissFirstRun(storage: Pick<Storage, "setItem">): void {
  storage.setItem(FIRST_RUN_DISMISS_KEY, "true");
}

export const SIDECAR_DEPENDENCY_NOTE =
  "Sidecar dependencies are optional for upload and planning. FFmpeg, Rubber Band, and Demucs unlock processing lanes when on PATH and installed in the service environment.";

export const SELF_TEST_WINDOWS_NOTE = RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE;
