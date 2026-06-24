import type { AudioInspection } from "../domain/types.ts";
import type {
  AudioEngineAdapter,
  EngineJobResult,
  MetadataAnalysisResult,
} from "./contracts.ts";
import { formatDuration, formatFileSize } from "../lib/audioMetadata.ts";

export const browserMetadataEngine: AudioEngineAdapter<AudioInspection, MetadataAnalysisResult> = {
  id: "metadata",
  name: "Local metadata inspection",
  status: "implemented",
  async analyze(inspection) {
    const data: MetadataAnalysisResult = {
      fileName: inspection.fileName,
      fileType: inspection.fileType,
      fileSizeBytes: inspection.fileSizeBytes,
      fileSizeLabel: formatFileSize(inspection.fileSizeBytes),
      durationSeconds: inspection.durationSeconds,
      durationLabel: formatDuration(inspection.durationSeconds),
      sampleRate: inspection.sampleRate,
      channelCount: inspection.channelCount,
      decoded: inspection.decoded,
      waveformPeakCount: inspection.waveformPeaks.length,
      notes: inspection.notes,
    };

    if (inspection.decoded) {
      return completeResult(
        data,
        "Duration, sample rate, channels, and waveform summary are available from browser decode."
      );
    }

    if (inspection.durationSeconds !== null || inspection.sampleRate !== null) {
      return completeResult(
        data,
        "Partial metadata is available. Browser decode did not succeed, so waveform and MIR engines may be limited."
      );
    }

    return {
      state: "failed",
      data,
      status: "implemented",
      message: "Browser metadata inspection could not read this file. Try another local format such as WAV or MP3.",
    };
  },
};

function completeResult(
  data: MetadataAnalysisResult,
  message: string
): EngineJobResult<MetadataAnalysisResult> {
  return {
    state: "complete",
    data,
    status: "implemented",
    message,
  };
}
