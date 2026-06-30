import { buildFullLengthExportRequestParams } from "../../domain/fullLengthExport.ts";
import { DEFAULT_MP3_BITRATE } from "../../domain/mp3Export.ts";
import {
  advanceQuickMixStep,
  completeQuickMixProgress,
  createInitialQuickMixProgress,
  QUICK_MIX_DEFAULT_MIX_SETTINGS,
  QUICK_MIX_OUTPUT_LABEL,
  QUICK_MIX_STEM_MAX_SECONDS,
  type QuickMixOutputModel,
  type QuickMixProgressStep,
  type QuickMixStepId,
  validateQuickMixUploads,
} from "../../domain/quickMix.ts";
import { mapQuickMixError, mapQuickMixException } from "../../domain/quickMixErrors.ts";
import { librosaAvailableForQuickMix } from "../../domain/quickMixReadiness.ts";
import {
  buildQuickMixDirectionContext,
  buildQuickMixTimingStrategy,
} from "../../domain/quickMixStrategy.ts";
import { buildStemPreviewRequestParams } from "../../domain/stemPreview.ts";
import { validateAudioFile } from "../audioMetadata.ts";
import { localEngineClient } from "../localEngine/client.ts";

export interface QuickMixRunInput {
  vocalFile: File;
  instrumentalFile: File;
}

export interface QuickMixRunResult {
  ok: boolean;
  output: QuickMixOutputModel | null;
  error: ReturnType<typeof mapQuickMixError> | null;
  steps: QuickMixProgressStep[];
}

export type QuickMixProgressCallback = (steps: QuickMixProgressStep[]) => void;

export async function runQuickMixPipeline(
  input: QuickMixRunInput,
  onProgress: QuickMixProgressCallback
): Promise<QuickMixRunResult> {
  let steps = createInitialQuickMixProgress();

  const setStep = (id: QuickMixStepId, status: QuickMixProgressStep["status"] = "active") => {
    steps = advanceQuickMixStep(steps, id, status);
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
      throw mapQuickMixError({ message: validation.message });
    }

    for (const file of [input.vocalFile, input.instrumentalFile]) {
      const fileCheck = validateAudioFile(file);
      if (!fileCheck.ok) {
        throw mapQuickMixError({ message: fileCheck.message });
      }
    }

    const connection = await localEngineClient.probeConnection();
    if (!connection.online) {
      throw mapQuickMixError({ message: "Local helper service is offline." });
    }

    steps = advanceQuickMixStep(steps, "checking_files", "complete");
    onProgress([...steps]);

    setStep("separating_vocal");
    const vocalStemParams = {
      ...buildStemPreviewRequestParams("trackA", input.vocalFile),
      maxPreviewSeconds: QUICK_MIX_STEM_MAX_SECONDS,
    };
    const vocalStem = await localEngineClient.processStemPreview(input.vocalFile, vocalStemParams);
    if (!vocalStem?.ok || !vocalStem.artifactId) {
      throw mapQuickMixError(vocalStem ?? { message: "Vocal separation failed." });
    }

    steps = advanceQuickMixStep(steps, "separating_vocal", "complete");
    onProgress([...steps]);

    setStep("preparing_instrumental");
    const beatStemParams = {
      ...buildStemPreviewRequestParams("trackB", input.instrumentalFile),
      maxPreviewSeconds: QUICK_MIX_STEM_MAX_SECONDS,
    };
    const beatStem = await localEngineClient.processStemPreview(input.instrumentalFile, beatStemParams);
    if (!beatStem?.ok || !beatStem.artifactId) {
      throw mapQuickMixError(beatStem ?? { message: "Instrumental preparation failed." });
    }

    steps = advanceQuickMixStep(steps, "preparing_instrumental", "complete");
    onProgress([...steps]);

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

    const context = buildQuickMixDirectionContext({
      vocalStemArtifactId: vocalStem.artifactId,
      beatStemArtifactId: beatStem.artifactId,
      strategy,
    });

    steps = advanceQuickMixStep(steps, "matching_timing", "complete");
    onProgress([...steps]);

    setStep("mixing_track");
    setStep("creating_export");

    const exportParams = buildFullLengthExportRequestParams(
      context,
      strategy.useNeutralProcessing,
      strategy.confirmNeutralSettings,
      "measurement_only",
      QUICK_MIX_DEFAULT_MIX_SETTINGS,
      "quick-mix"
    );

    const wavExport = await localEngineClient.createFullWavExport(exportParams);
    if (!wavExport?.ok || !wavExport.exportArtifactId) {
      throw mapQuickMixError(wavExport ?? { message: "Local WAV export failed." });
    }

    let mp3PlaybackUrl: string | null = null;
    let mp3DownloadUrl: string | null = null;
    let mp3ArtifactId: string | null = null;

    const mp3Export = await localEngineClient.createMp3Export({
      sourceWavExportArtifactId: wavExport.exportArtifactId,
      bitrateKbps: DEFAULT_MP3_BITRATE,
      exportLabel: "quick-mix-mp3",
    });
    if (mp3Export?.ok) {
      mp3PlaybackUrl = mp3Export.playbackUrl;
      mp3DownloadUrl = mp3Export.downloadUrl;
      mp3ArtifactId = mp3Export.exportArtifactId;
    }

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
      technicalSummary: [
        `Vocal stem: ${vocalStem.artifactId}`,
        `Instrumental stem: ${beatStem.artifactId}`,
        `WAV export: ${wavExport.exportArtifactId}`,
        mp3ArtifactId ? `MP3 export: ${mp3ArtifactId}` : "MP3 export: not created",
        strategy.timingNotice,
      ],
    };

    return { ok: true, output, error: null, steps };
  } catch (error) {
    const mapped =
      error && typeof error === "object" && "headline" in error
        ? (error as ReturnType<typeof mapQuickMixError>)
        : mapQuickMixException(error);

    const failedStep = steps.find((step: QuickMixProgressStep) => step.status === "active")?.id ?? "creating_export";
    steps = advanceQuickMixStep(steps, failedStep, "failed");
    onProgress([...steps]);

    return { ok: false, output: null, error: mapped, steps };
  }
}
