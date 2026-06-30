import { requiredRightsNotice } from "../lib/legal.ts";
import { APP_DEV_URL } from "./localDemoStart.ts";
import {
  SIDECAR_BIND,
  SIDECAR_CAPABILITIES_URL,
  SIDECAR_HEALTH_URL,
} from "./sidecarLifecycle.ts";

/** Paths and globs that must stay out of git for local MVP releases. */
export const RELEASE_GITIGNORE_PATTERNS = [
  "node_modules/",
  "dist/",
  ".vite/",
  "local-engine/service/.venv/",
  "local-engine/service/.work/",
  "local-engine/service/.cache/",
  "__pycache__/",
  "*.pyc",
  ".pytest_cache/",
  ".venv-rhythm/",
  "*.tsbuildinfo",
  ".env",
  ".env.*",
  "*.log",
] as const;

export interface DependencyVerifyCommand {
  id: string;
  label: string;
  command: string;
  notes?: string;
}

export const WINDOWS_MVP_VERIFY_COMMANDS: readonly DependencyVerifyCommand[] = [
  { id: "node", label: "Node.js", command: "node -v" },
  { id: "npm", label: "npm", command: "npm -v" },
  { id: "sidecar-venv", label: "Sidecar venv Python", command: "local-engine/service/.venv/Scripts/python.exe --version" },
  { id: "ffmpeg", label: "FFmpeg", command: "ffmpeg -version" },
  { id: "ffprobe", label: "ffprobe", command: "ffprobe -version" },
  { id: "rubberband", label: "Rubber Band CLI", command: "rubberband --version" },
  { id: "sidecar-health", label: "Sidecar health", command: "npm run sidecar:status" },
  { id: "capabilities", label: "Capabilities", command: "curl.exe -s http://127.0.0.1:47831/v1/capabilities" },
  { id: "strict-setup", label: "Strict Windows setup", command: "npm run setup:windows:check:strict" },
  { id: "analysis-lane", label: "Librosa lane (optional)", command: "npm run validate:analysis-lane" },
  {
    id: "wsl-rhythm",
    label: "WSL rhythm (optional)",
    command: "npm run sidecar:wsl:check",
    notes: "Optional verified downbeat lane — not required for Windows MVP.",
  },
] as const;

export interface MvpReleaseChecklistItem {
  id: string;
  label: string;
  commandOrPath?: string;
}

export const MVP_RELEASE_PREFLIGHT_ITEMS: readonly MvpReleaseChecklistItem[] = [
  { id: "install", label: "Install Node dependencies", commandOrPath: "npm install" },
  { id: "strict", label: "Strict runtime check passes", commandOrPath: "npm run setup:windows:check:strict" },
  { id: "sidecar", label: "Sidecar healthy", commandOrPath: "npm run sidecar:status" },
  { id: "start", label: "One-command demo start", commandOrPath: "npm run start:local:windows" },
] as const;

export const MVP_RELEASE_URLS = {
  app: APP_DEV_URL,
  sidecar: SIDECAR_BIND,
  health: SIDECAR_HEALTH_URL,
  capabilities: SIDECAR_CAPABILITIES_URL,
} as const;

export const MVP_RELEASE_LIMITATIONS = [
  "No public sharing, cloud upload, downloader, or streaming integrations in the MVP.",
  "librosa BPM/key and phrase lanes are experimental — DJ review required.",
  "Demucs first run may download model weights to the user torch hub cache (~80MB) — not committed to git.",
  "Manual UI screenshots may be required when IDE browser automation cannot reach local Vite.",
  "Global python may be absent on PATH — sidecar venv scripts cover checks.",
] as const;

export function formatDependencyManifestRow(name: string, version: string, verifyCommand?: string): string {
  const verifyCell = verifyCommand ? `\`${verifyCommand}\`` : "—";
  return `| ${name} | ${version} | ${verifyCell} |`;
}

export function formatDependencyVerifyBlock(commands: readonly DependencyVerifyCommand[]): string[] {
  return commands.map((item) => {
    const note = item.notes ? ` (${item.notes})` : "";
    return `- **${item.label}:** \`${item.command}\`${note}`;
  });
}

export function includesReleaseSafetyLanguage(text: string): boolean {
  return (
    /no public sharing|no cloud upload|local-only|local only/i.test(text) &&
    /authorized to use|user's responsibility/i.test(text) &&
    text.includes(requiredRightsNotice)
  );
}

export function matchesReleaseGitignorePattern(relativePath: string, patterns: readonly string[] = RELEASE_GITIGNORE_PATTERNS): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return patterns.some((pattern) => {
    if (pattern.endsWith("/")) {
      return normalized.includes(pattern) || normalized.startsWith(pattern.slice(0, -1));
    }
    if (pattern.startsWith("*.")) {
      return normalized.endsWith(pattern.slice(1));
    }
    return normalized === pattern || normalized.endsWith(`/${pattern}`);
  });
}

export function buildDemoPackageFileList(): string[] {
  return [
    "README.md",
    "docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md",
    "docs/RELEASE_DEPENDENCIES_WINDOWS.md",
    "docs/PHASE_34_RELEASE_DOCUMENTATION.md",
    "qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1",
    "qa/full-local-workflow/phase-34/screenshots/README.md",
    "qa/full-local-workflow/phase-34/screenshots/EVIDENCE_MANIFEST.md",
    "qa/full-local-workflow/phase-35/PACKAGE_RECIPE.md",
  ];
}
