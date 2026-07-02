import { sidecarVenvPythonCandidates } from "./windowsRuntimeSetup.ts";

export type PythonResolutionSource = "global" | "venv" | "none";

export interface PythonResolution {
  command: string | null;
  source: PythonResolutionSource;
  venvPath: string | null;
  globalAvailable: boolean;
}

export const PYTHON_SERVICE_COMPILE_TARGETS = [
  "local-engine/service/main.py",
  "local-engine/service/capabilities.py",
  "local-engine/service/metadata.py",
  "local-engine/service/beat_analysis.py",
  "local-engine/service/key_analysis.py",
  "local-engine/service/phrase_analysis.py",
  "local-engine/service/rhythm_selftest.py",
  "local-engine/service/rhythm_fixtures.py",
  "local-engine/service/validate_rhythm_linux.py",
  "local-engine/service/rhythm_engines/__init__.py",
  "local-engine/service/rhythm_engines/base.py",
  "local-engine/service/rhythm_engines/essentia_engine.py",
  "local-engine/service/rhythm_engines/madmom_engine.py",
  "local-engine/service/rhythm_engines/beatnet_engine.py",
  "local-engine/service/rhythm_engines/registry.py",
  "local-engine/service/pitch_time_planning.py",
  "local-engine/service/rubber_band_processing.py",
  "local-engine/service/demucs_processing.py",
  "local-engine/service/quick_mix_source_prep.py",
  "local-engine/service/combined_preview_processing.py",
  "local-engine/service/export_processing.py",
  "local-engine/service/full_length_export_processing.py",
  "local-engine/service/section_export_processing.py",
  "local-engine/service/arrangement_context.py",
  "local-engine/service/mp3_export_processing.py",
  "local-engine/service/mastering_presets.py",
  "local-engine/service/mastering_processing.py",
  "local-engine/service/mix_settings.py",
  "local-engine/service/error_responses.py",
  "local-engine/service/package_export_processing.py",
  "local-engine/service/loudness_gate.py",
  "local-engine/service/artifact_management.py",
  "local-engine/service/librosa_support.py",
  "local-engine/service/uploads.py",
  "local-engine/service/jobs.py",
  "local-engine/service/models.py",
  "local-engine/service/config.py",
  "local-engine/service/remix_brain_processing.py",
  "local-engine/service/remix_brain/__init__.py",
  "local-engine/service/remix_brain/models.py",
  "local-engine/service/remix_brain/planner.py",
  "local-engine/service/remix_brain/phrase.py",
  "local-engine/service/remix_brain/harmonic.py",
  "local-engine/service/remix_brain/validate.py",
  "local-engine/service/remix_brain/gridsync.py",
  "local-engine/service/remix_brain/align.py",
  "local-engine/service/remix_brain/beatgrid.py",
  "local-engine/service/remix_brain/analysis.py",
  "local-engine/service/remix_brain/io_utils.py",
  "local-engine/service/arrangement_brain_processing.py",
  "local-engine/service/arrangement_export_processing.py",
  "local-engine/service/arrangement_brain/__init__.py",
  "local-engine/service/arrangement_brain/models.py",
  "local-engine/service/arrangement_brain/planner.py",
  "local-engine/service/arrangement_brain/scoring.py",
] as const;

export const ANALYSIS_SETUP_GUIDANCE =
  "Optional BPM/key/heuristic phrase lanes: npm run setup:analysis (installs librosa in sidecar venv)";

export const PYTHON_MISSING_GUIDANCE =
  "Install Python 3.10+ or create the sidecar venv: cd local-engine/service && python -m venv .venv && pip install -r requirements.txt";

export function findExistingSidecarVenvPython(
  rootDir: string,
  exists: (path: string) => boolean = () => false
): string | null {
  return sidecarVenvPythonCandidates(rootDir).find((candidate) => exists(candidate)) ?? null;
}

export function resolvePythonForChecks(input: {
  globalPythonAvailable: boolean;
  venvPythonPath: string | null;
  preferVenv?: boolean;
  venvOnly?: boolean;
}): PythonResolution {
  const { globalPythonAvailable, venvPythonPath, preferVenv = true, venvOnly = false } = input;

  if (venvOnly) {
    return venvPythonPath
      ? { command: venvPythonPath, source: "venv", venvPath: venvPythonPath, globalAvailable: globalPythonAvailable }
      : { command: null, source: "none", venvPath: null, globalAvailable: globalPythonAvailable };
  }

  if (preferVenv && venvPythonPath) {
    return {
      command: venvPythonPath,
      source: "venv",
      venvPath: venvPythonPath,
      globalAvailable: globalPythonAvailable,
    };
  }

  if (globalPythonAvailable) {
    return { command: "python", source: "global", venvPath: venvPythonPath, globalAvailable: true };
  }

  if (venvPythonPath) {
    return { command: venvPythonPath, source: "venv", venvPath: venvPythonPath, globalAvailable: false };
  }

  return { command: null, source: "none", venvPath: null, globalAvailable: false };
}

export function formatPythonResolutionLabel(resolution: PythonResolution): string {
  switch (resolution.source) {
    case "global":
      return "global python on PATH";
    case "venv":
      return "sidecar venv python";
    default:
      return "none";
  }
}

export function pythonRuntimeAvailableForSidecar(
  globalPythonAvailable: boolean,
  venvPythonPath: string | null
): boolean {
  return globalPythonAvailable || venvPythonPath !== null;
}

export function evaluateStrictWindowsRuntimeExit(
  items: Array<{ id: string; tier: string; status: string }>,
  strict: boolean
): number {
  if (!strict) {
    return 0;
  }

  const blocking = items.filter((item) => {
    if (item.tier !== "processing") {
      return false;
    }
    if (item.id === "ffmpeg" || item.id === "python") {
      return item.status !== "available";
    }
    return false;
  });

  return blocking.length > 0 ? 1 : 0;
}
