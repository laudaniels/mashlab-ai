import type { RhythmSelfTestResponse, RhythmSelfTestStatus } from "./rhythmSelfTest.ts";

export const WINDOWS_MVP_RHYTHM_NOTICE =
  "Windows MVP works without advanced rhythm engines. Heuristic phrase planning is the default fallback.";

export const WSL_OPTIONAL_RHYTHM_NOTICE =
  "WSL/Linux is optional — only needed to install madmom/Essentia for verified downbeat/phrase analysis.";

export const VERIFIED_RHYTHM_LABEL_NOTICE =
  "Verified labels appear only when an advanced engine returns real downbeat or phrase markers — never from heuristic output.";

export const WSL_SIDEcar_SCRIPTS = {
  setupLinux: "scripts/setup-rhythm-linux.sh",
  setupWsl: "scripts/setup-wsl-rhythm.ps1",
  runLinux: "scripts/run-sidecar-linux.sh",
  runWsl: "scripts/run-wsl-sidecar.ps1",
  selfTestLinux: "scripts/rhythm-selftest-linux.sh",
  selfTestHarness: "scripts/rhythm-selftest-harness.mts",
  wslCheck: "scripts/wsl-sidecar-check.mts",
} as const;

export const SELF_TEST_STATUS_MEANINGS: Record<RhythmSelfTestStatus, string> = {
  pass: "Engine ran on synthetic click track and returned usable markers.",
  missing_dependency: "Required Python package missing (e.g. librosa for heuristic).",
  not_configured: "Optional engine not installed — expected on Windows without WSL.",
  failed: "Engine importable but smoke test produced no valid markers.",
  not_implemented: "Adapter stub only (e.g. BeatNet+).",
  skipped: "Engine not tested in this run.",
};

export interface WslSidecarCheckResult {
  wslAvailable: boolean;
  message: string;
  suggestedCommand: string | null;
}

export function buildWslBashCommand(linuxRepoPath: string, scriptRelativePath: string, args: string[] = []): string {
  const escapedPath = linuxRepoPath.replace(/'/g, "'\\''");
  const argSuffix = args.length > 0 ? ` ${args.join(" ")}` : "";
  return `wsl bash -lc "cd '${escapedPath}' && bash ${scriptRelativePath}${argSuffix}"`;
}

export function buildWslSelfTestCommand(linuxRepoPath: string, strict: boolean): string {
  const strictEnv = strict ? "STRICT=1" : "STRICT=0";
  const escapedPath = linuxRepoPath.replace(/'/g, "'\\''");
  return `wsl bash -lc "cd '${escapedPath}' && ${strictEnv} bash scripts/rhythm-selftest-linux.sh"`;
}

export function parseStrictModeFlag(argv: string[]): boolean {
  return argv.includes("--strict");
}

export function parseSidecarUrl(argv: string[]): string {
  const index = argv.indexOf("--url");
  if (index === -1 || !argv[index + 1]) {
    return "http://127.0.0.1:47831";
  }
  return argv[index + 1]!;
}

export function evaluateSelfTestHarnessExit(
  response: RhythmSelfTestResponse | null,
  options: { strict: boolean; sidecarReachable: boolean; wslAvailable?: boolean }
): number {
  if (!options.sidecarReachable) {
    if (options.strict) {
      return 1;
    }
    return 0;
  }

  if (!response) {
    return options.strict ? 1 : 0;
  }

  if (!response.noUserAudioProcessed) {
    return options.strict ? 1 : 0;
  }

  if (options.strict && !response.heuristicFallbackAvailable) {
    return 1;
  }

  for (const result of response.results) {
    if (
      options.strict &&
      (result.basisLabel === "Verified phrase" || result.basisLabel === "Verified downbeat") &&
      result.smokeTestStatus === "pass" &&
      result.phraseMarkerCount === 0 &&
      result.downbeatMarkerCount === 0
    ) {
      return 1;
    }
  }

  return 0;
}

export function formatSelfTestStatusMeaning(status: RhythmSelfTestStatus): string {
  return SELF_TEST_STATUS_MEANINGS[status] ?? status;
}

export function formatWindowsFallbackMessage(wslAvailable: boolean): string {
  if (wslAvailable) {
    return `${WINDOWS_MVP_RHYTHM_NOTICE} WSL detected — run npm run sidecar:wsl:setup for optional verified rhythm engines.`;
  }
  return `${WINDOWS_MVP_RHYTHM_NOTICE} ${WSL_OPTIONAL_RHYTHM_NOTICE}`;
}

export function wslSidecarCheckFromAvailability(wslAvailable: boolean): WslSidecarCheckResult {
  if (wslAvailable) {
    return {
      wslAvailable: true,
      message: "WSL available — optional rhythm bootstrap can run via npm run sidecar:wsl:setup",
      suggestedCommand: "npm run sidecar:wsl:setup",
    };
  }
  return {
    wslAvailable: false,
    message: "WSL not installed — Windows MVP unchanged; heuristic phrase planning remains default.",
    suggestedCommand: null,
  };
}
