import type {
  ArrangementDraftResult,
  AudioEngineAdapter,
  BeatAnalysisResult,
  EngineJobResult,
  ExportMasteringResult,
  KeyAnalysisResult,
  PitchTimePlanResult,
  StemSeparationResult,
  VocalCleanupPlanResult,
} from "./contracts.ts";
import type { AudioInspection } from "../domain/types.ts";

function pendingResult<T>(
  status: "engine-pending" | "analysis-coming-next",
  message: string
): EngineJobResult<T> {
  return {
    state: "idle",
    data: null,
    status,
    message,
  };
}

export const stubBeatEngine: AudioEngineAdapter<AudioInspection, BeatAnalysisResult> = {
  id: "beat-phrase",
  name: "Beat, downbeat, tempo, phrase",
  status: "analysis-coming-next",
  async analyze(inspection) {
    if (!inspection.decoded) {
      return {
        state: "failed",
        data: null,
        status: "analysis-coming-next",
        message: "Beat analysis requires a decoded audio buffer. Browser decode failed for this file.",
      };
    }

    return pendingResult(
      "analysis-coming-next",
      "BPM, downbeat, and phrase detection will run through the BeatNet+/Essentia adapter lane."
    );
  },
};

export const stubKeyEngine: AudioEngineAdapter<AudioInspection, KeyAnalysisResult> = {
  id: "key-harmony",
  name: "Key and harmonic matching",
  status: "analysis-coming-next",
  async analyze(inspection) {
    if (!inspection.decoded) {
      return {
        state: "failed",
        data: null,
        status: "analysis-coming-next",
        message: "Key analysis requires a decoded audio buffer. Browser decode failed for this file.",
      };
    }

    return pendingResult(
      "analysis-coming-next",
      "Key, Camelot compatibility, and pitch-shift hints will run through the key detector adapter."
    );
  },
};

export const stubStemEngine: AudioEngineAdapter<AudioInspection, StemSeparationResult> = {
  id: "stem-separation",
  name: "Stem separation",
  status: "engine-pending",
  async analyze() {
    return pendingResult(
      "engine-pending",
      "Stem lanes will be produced by the Demucs / HTDemucs adapter when integrated."
    );
  },
};

export const stubPitchTimeEngine: AudioEngineAdapter<AudioInspection, PitchTimePlanResult> = {
  id: "pitch-time",
  name: "Pitch/time processing",
  status: "engine-pending",
  async analyze() {
    return pendingResult(
      "engine-pending",
      "Pitch/time planning will use Rubber Band first, with SoundTouch as a lightweight fallback."
    );
  },
};

export const stubVocalCleanupEngine: AudioEngineAdapter<AudioInspection, VocalCleanupPlanResult> = {
  id: "vocal-chain",
  name: "Vocal cleanup and tone",
  status: "engine-pending",
  async analyze() {
    return pendingResult(
      "engine-pending",
      "Vocal cleanup will expose gain, EQ, compression, de-essing, and space matching as a controllable chain."
    );
  },
};

export const stubArrangementEngine: AudioEngineAdapter<AudioInspection, ArrangementDraftResult> = {
  id: "arrangement",
  name: "Arrangement intelligence",
  status: "engine-pending",
  async analyze() {
    return pendingResult(
      "engine-pending",
      "Arrangement drafts will remain phrase-aware and user-editable when the local engine is connected."
    );
  },
};

export const stubExportMasteringEngine: AudioEngineAdapter<AudioInspection, ExportMasteringResult> = {
  id: "export-mastering",
  name: "Export and mastering",
  status: "engine-pending",
  async analyze() {
    return pendingResult(
      "engine-pending",
      "DJ-safe export will require render, LUFS, true peak, and headroom checks before it unlocks."
    );
  },
};

export const defaultStemLanes: StemSeparationResult["stems"] = [
  { id: "vocals", label: "Vocals", available: false },
  { id: "drums", label: "Drums", available: false },
  { id: "bass", label: "Bass", available: false },
  { id: "other", label: "Other", available: false },
];
