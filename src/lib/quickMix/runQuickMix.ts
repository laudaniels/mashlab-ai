import { buildFullLengthExportRequestParams } from "../../domain/fullLengthExport.ts";
import { DEFAULT_MP3_BITRATE } from "../../domain/mp3Export.ts";
import {
  advanceQuickMixStep,
  completeQuickMixProgress,
  createInitialQuickMixProgress,
  QUICK_MIX_DEFAULT_MIX_SETTINGS,
  QUICK_MIX_OUTPUT_LABEL,
  type QuickMixOutputModel,
  type QuickMixProgressStep,
  type QuickMixStepId,
  validateQuickMixUploads,
} from "../../domain/quickMix.ts";
import {
  mapQuickMixDependencyFailure,
  mapQuickMixError,
  mapQuickMixException,
  mapQuickMixExportFailure,
  mapQuickMixStemFailure,
  type QuickMixPlainError,
} from "../../domain/quickMixErrors.ts";
import { librosaAvailableForQuickMix, buildQuickMixReadiness, isQuickMixReady } from "../../domain/quickMixReadiness.ts";
import {
  buildQuickMixStemRequestParams,
  missingQuickMixDependencyLabels,
  resolveQuickMixExportStemIds,
  validateQuickMixStemRequest,
  type QuickMixSource,
} from "../../domain/quickMixPipeline.ts";
import {
  buildQuickMixDirectionContext,
  buildQuickMixTimingStrategy,
} from "../../domain/quickMixStrategy.ts";
import { validateAudioFile } from "../audioMetadata.ts";
import { localEngineClient } from "../localEngine/client.ts";
import type { StemPreviewResult } from "../../domain/stemPreview.ts";
import type { FullLengthExportResult } from "../../domain/fullLengthExport.ts";

export interface QuickMixRunInput {
  vocalFile: File;
  instrumentalFile: File;
}

export interface QuickMixRunResult {
  ok: boolean;
  output: QuickMixOutputModel | null;
  error: QuickMixPlainError | null;
  steps: QuickMixProgressStep[];
}

export type QuickMixProgressCallback = (steps: QuickMixProgressStep[]) => void;

function throwMapped(error: QuickMixPlainError): never {
  throw error;
}

async function runStemStep(
  source: QuickMixSource,
  file: File
): Promise<StemPreviewResult> {
  const params = buildQuickMixStemRequestParams(source, file);
  const clientErrors = validateQuickMixStemRequest(params);
  if (clientErrors.length > 0) {
    throwMapped(
      mapQuickMixStemFailure(
        {
          message: "Stem preview settings were rejected before sending.",
          status: "validation_error",
          validationErrors: clientErrors,
        },
        source
      )
    );
  }

  const result = await localEngineClient.processStemPreview(file, params);
  if (!result) {
    throwMapped(
      mapQuickMixStemFailure(
        { message: "No response from local engine for stem separation.", status: "offline" },
        source
      )
    );
  }

  if (!result.ok || !result.artifactId || !result.audioProcessed) {
    throwMapped(mapQuickMixStemFailure(result, source));
  }

  const stemRole = source === "vocal" ? result.vocals : result.noVocals;
  if (!stemRole) {
    throwMapped(
      mapQuickMixStemFailure(
        {
          message:
            source === "vocal"
              ? "Vocal separation finished but vocals.wav was missing."
              : "Instrumental preparation finished but no_vocals.wav was missing.",
          status: "processing_failed",
          validationErrors: [],
        },
        source
      )
    );
  }

  return result;
}

export async function runQuickMixPipeline(
  input: QuickMixRunInput,
  onProgress: QuickMixProgressCallback
): Promise<QuickMixRunResult> {
  let steps = createInitialQuickMixProgress();

  const setStep = (id: QuickMixStepId, status: QuickMixProgressStep["status"] = "active") => {
    steps = advanceQuickMixStep(steps, id, status);
    onProgress([...steps]);
  };

  const completeStep = (id: QuickMixStepId) => {
    steps = advanceQuickMixStep(steps, id, "complete");
    onProgress([...steps]);
  };

  try {
    setStep("checking_files");

    const validation = validateQuickMixUploads({
      vocalFile: input.vocalFile,
      vocalFileName: input.vocalFile.name,
      instrumentalFile: input.instrumentalFile,
      instrumentalFileName: input.instrumentalFile.name,
    });
    if (!validation.ok) {
      throw mapQuickMixError({
        message: validation.message,
        failedStepId: "checking_files",
      });
    }

    for (const file of [input.vocalFile, input.instrumentalFile]) {
      const fileCheck = validateAudioFile(file);
      if (!fileCheck.ok) {
        throw mapQuickMixError({
          message: fileCheck.message,
          failedStepId: "checking_files",
        });
      }
    }

    const connection = await localEngineClient.probeConnection();
    const readiness = buildQuickMixReadiness({
      sidecarOnline: connection.online,
      capabilities: connection.capabilities,
    });
    if (!isQuickMixReady(readiness)) {
      throw mapQuickMixDependencyFailure(missingQuickMixDependencyLabels(readiness), "checking_files");
    }

    completeStep("checking_files");

    setStep("separating_vocal");
    const vocalStem = await runStemStep("vocal", input.vocalFile);
    completeStep("separating_vocal");

    setStep("preparing_instrumental");
    const beatStem = await runStemStep("instrumental", input.instrumentalFile);
    completeStep("preparing_instrumental");

    setStep("matching_timing");
    const librosaUsed = librosaAvailableForQuickMix(connection.capabilities);
    let vocalBpm: number | null = null;
    let beatBpm: number | null = null;

    if (librosaUsed) {
      const vocalBeat = await localEngineClient.analyzeBeat(input.vocalFile);
      const beatBeat = await localEngineClient.analyzeBeat(input.instrumentalFile);
      vocalBpm = vocalBeat?.result?.bpm ?? null;
      beatBpm = beatBeat?.result?.bpm ?? null;
    }

    const strategy = buildQuickMixTimingStrategy({
      vocalBpm,
      beatBpm,
      pitchShiftSemitones: 0,
      librosaUsed,
    });

    const stemIds = resolveQuickMixExportStemIds({ vocalStem, instrumentalStem: beatStem });
    if (!stemIds) {
      throw mapQuickMixError({
        message: "Could not resolve vocal and instrumental stem artifacts for export.",
        failedStepId: "matching_timing",
      });
    }

    const context = buildQuickMixDirectionContext({
      vocalStemArtifactId: stemIds.sourceVocalStemArtifactId,
      beatStemArtifactId: stemIds.targetInstrumentalStemArtifactId,
      strategy,
    });

    completeStep("matching_timing");

    setStep("mixing_track");
    completeStep("mixing_track");

    setStep("creating_wav_export");

    const exportParams = buildFullLengthExportRequestParams(
      context,
      strategy.useNeutralProcessing,
      strategy.confirmNeutralSettings,
      "measurement_only",
      QUICK_MIX_DEFAULT_MIX_SETTINGS,
      "quick-mix"
    );

    const wavExport: FullLengthExportResult | null = await localEngineClient.createFullWavExport(exportParams);
    if (!wavExport?.ok || !wavExport.exportArtifactId) {
      throw mapQuickMixExportFailure(wavExport ?? { message: "Local WAV export failed." }, "creating_wav_export");
    }

    completeStep("creating_wav_export");

    setStep("creating_mp3_reference");

    let mp3PlaybackUrl: string | null = null;
    let mp3DownloadUrl: string | null = null;
    let mp3ArtifactId: string | null = null;
    let mp3SkippedReason: string | null = null;

    const mp3Export = await localEngineClient.createMp3Export({
      sourceWavExportArtifactId: wavExport.exportArtifactId,
      bitrateKbps: DEFAULT_MP3_BITRATE,
      exportLabel: "quick-mix-mp3",
    });
    if (mp3Export?.ok) {
      mp3PlaybackUrl = mp3Export.playbackUrl;
      mp3DownloadUrl = mp3Export.downloadUrl;
      mp3ArtifactId = mp3Export.exportArtifactId;
    } else {
      mp3SkippedReason = mp3Export?.message ?? "MP3 reference export was not created — WAV export is still available.";
    }

    completeStep("creating_mp3_reference");

    steps = completeQuickMixProgress(steps);
    onProgress([...steps]);

    const output: QuickMixOutputModel = {
      wavPlaybackUrl: wavExport.playbackUrl,
      wavDownloadUrl: wavExport.downloadUrl,
      mp3PlaybackUrl,
      mp3DownloadUrl,
      exportLabel: QUICK_MIX_OUTPUT_LABEL,
      timingNotice: strategy.timingNotice,
      wavArtifactId: wavExport.exportArtifactId,
      mp3ArtifactId,
      durationSeconds: wavExport.durationSeconds,
      mp3SkippedReason,
      technicalSummary: [
        `Vocal stem (vocals.wav): ${vocalStem.artifactId}`,
        `Instrumental stem (no_vocals.wav): ${beatStem.artifactId}`,
        `WAV export: ${wavExport.exportArtifactId}`,
        mp3ArtifactId ? `MP3 export: ${mp3ArtifactId}` : `MP3 export: skipped${mp3SkippedReason ? ` — ${mp3SkippedReason}` : ""}`,
        strategy.timingNotice,
      ],
    };

    return { ok: true, output, error: null, steps };
  } catch (error) {
    const mapped: QuickMixPlainError =
      error && typeof error === "object" && "headline" in error
        ? (error as QuickMixPlainError)
        : mapQuickMixException(error);

    const failedStep =
      mapped.failedStepId ??
      steps.find((step: QuickMixProgressStep) => step.status === "active")?.id ??
      "creating_wav_export";
    steps = advanceQuickMixStep(steps, failedStep, "failed");
    onProgress([...steps]);

    return { ok: false, output: null, error: mapped, steps };
  }
}
