import type { AudioInspection } from "../domain/types.ts";
import type { BeatEngine, EngineJobResult, KeyEngine } from "./contracts.ts";
import type { BeatAnalysisResult, KeyAnalysisResult } from "./contracts.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import {
  beatResultDetails,
  isLibrosaAvailable,
  keyResultDetails,
} from "../lib/localEngine/analysis.ts";
import type { LocalEngineConnectionStatus } from "../lib/localEngine/types.ts";
import { stubBeatEngine, stubKeyEngine } from "./stubEngines.ts";

export interface LocalMirContext {
  file: File | null;
  localStatus: LocalEngineConnectionStatus | null;
}

function canRunLocalMir(context: LocalMirContext): boolean {
  return Boolean(
    context.file &&
      context.localStatus?.online &&
      isLibrosaAvailable(context.localStatus.capabilities)
  );
}

export function createLocalAwareBeatEngine(context: LocalMirContext): BeatEngine {
  return {
    id: stubBeatEngine.id,
    name: stubBeatEngine.name,
    status: canRunLocalMir(context) ? "implemented" : stubBeatEngine.status,
    async analyze(inspection: AudioInspection): Promise<EngineJobResult<BeatAnalysisResult>> {
      if (!inspection.decoded) {
        return stubBeatEngine.analyze(inspection);
      }

      if (!canRunLocalMir(context) || !context.file) {
        if (context.localStatus?.online && !isLibrosaAvailable(context.localStatus.capabilities)) {
          return {
            state: "failed",
            data: null,
            status: "analysis-coming-next",
            message:
              "Local service is online, but librosa is not installed. Install optional analysis dependencies in the service venv.",
            details: ["Optional setup: pip install -r requirements-analysis.txt"],
          };
        }

        return stubBeatEngine.analyze(inspection);
      }

      const response = await localEngineClient.analyzeBeat(context.file, inspection.id);

      if (!response) {
        return {
          state: "failed",
          data: null,
          status: "analysis-coming-next",
          message: "Local beat analysis request failed. Browser-only fallback remains available.",
        };
      }

      if (!response.ok || !response.result) {
        return {
          state: "failed",
          data: null,
          status: "analysis-coming-next",
          message: response.message,
          details: response.setup_guidance ? [response.setup_guidance] : undefined,
        };
      }

      return {
        state: "complete",
        data: {
          bpm: response.result.bpm,
          bpmConfidence: response.result.confidence,
          beatTimes: response.result.beat_times,
          beatCount: response.result.beat_count,
          method: response.result.method,
          limitations: response.result.limitations,
          downbeatOffsetMs: null,
          phraseBarMarkers: [],
          downbeatStatus: response.result.downbeat_status,
          phraseMarkerStatus: response.result.phrase_marker_status,
        },
        status: "implemented",
        message: "Experimental BPM prototype computed by the local service.",
        details: beatResultDetails(response.result),
      };
    },
  };
}

export function createLocalAwareKeyEngine(context: LocalMirContext): KeyEngine {
  return {
    id: stubKeyEngine.id,
    name: stubKeyEngine.name,
    status: canRunLocalMir(context) ? "implemented" : stubKeyEngine.status,
    async analyze(inspection: AudioInspection): Promise<EngineJobResult<KeyAnalysisResult>> {
      if (!inspection.decoded) {
        return stubKeyEngine.analyze(inspection);
      }

      if (!canRunLocalMir(context) || !context.file) {
        if (context.localStatus?.online && !isLibrosaAvailable(context.localStatus.capabilities)) {
          return {
            state: "failed",
            data: null,
            status: "analysis-coming-next",
            message:
              "Local service is online, but librosa is not installed. Install optional analysis dependencies in the service venv.",
            details: ["Optional setup: pip install -r requirements-analysis.txt"],
          };
        }

        return stubKeyEngine.analyze(inspection);
      }

      const response = await localEngineClient.analyzeKey(context.file, inspection.id);

      if (!response) {
        return {
          state: "failed",
          data: null,
          status: "analysis-coming-next",
          message: "Local key analysis request failed. Browser-only fallback remains available.",
        };
      }

      if (!response.ok || !response.result) {
        return {
          state: "failed",
          data: null,
          status: "analysis-coming-next",
          message: response.message,
          details: response.setup_guidance ? [response.setup_guidance] : undefined,
        };
      }

      return {
        state: "complete",
        data: {
          key: response.result.key,
          mode: response.result.mode,
          camelot: response.result.camelot,
          confidence: response.result.confidence,
          method: response.result.method,
          limitations: response.result.limitations,
          pitchShiftSemitones: null,
        },
        status: "implemented",
        message: "Experimental key prototype computed by the local service.",
        details: keyResultDetails(response.result),
      };
    },
  };
}
