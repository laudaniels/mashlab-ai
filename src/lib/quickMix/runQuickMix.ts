import { buildFullLengthExportRequestParams } from "../../domain/fullLengthExport.ts";
import { DEFAULT_MP3_BITRATE } from "../../domain/mp3Export.ts";
import {
  advanceQuickMixStep,
  createInitialQuickMixProgress,
  failQuickMixProgress,
  QUICK_MIX_DEFAULT_MIX_SETTINGS,
  QUICK_MIX_OUTPUT_LABEL,
  succeedQuickMixProgress,
  type QuickMixOutputModel,
  type QuickMixProgressStep,
  type QuickMixStepId,
  type QuickMixUploadSlot,
  validateQuickMixUploads,
} from "../../domain/quickMix.ts";
import {
  buildQuickMixListeningComparisonNotes,
  buildQuickMixLoudnessNotice,
  buildQuickMixLoudnessWarnings,
  buildQuickMixMixProfileSummary,
  formatQuickMixLoudnessTechnicalLine,
  QUICK_MIX_LISTENING_MIX_NOTICE,
  QUICK_MIX_RC2_BASELINE_MIX_SETTINGS,
} from "../../domain/quickMixListening.ts";
import {
  mapQuickMixDependencyFailure,
  mapQuickMixError,
  mapQuickMixException,
  mapQuickMixExportFailure,
  mapQuickMixNoResponseStemFailure,
  mapQuickMixSidecarFailure,
  mapQuickMixStemFailure,
  mp3SkippedMessageAfterWavSuccess,
  type QuickMixPlainError,
} from "../../domain/quickMixErrors.ts";
import { isDemucsAvailable } from "../../lib/localEngine/capabilities.ts";
import {
  librosaAvailableForQuickMix,
  buildQuickMixReadiness,
  isQuickMixReady,
} from "../../domain/quickMixReadiness.ts";
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
  buildQuickMixTimingStrategyFromBrain,
} from "../../domain/quickMixStrategy.ts";
import { buildQuickMixRemixBrainCard } from "../../domain/remixBrain.ts";
import {
  buildQuickMixArrangementCard,
  type ArrangementStyle,
} from "../../domain/arrangementBrain.ts";
import {
  buildQuickMixSectionNotice,
  buildQuickMixSectionSummaryLines,
  effectiveQuickMixWindowSeconds,
  shouldPrepareQuickMixSourceForSection,
  validateQuickMixSectionAgainstDuration,
  type QuickMixSectionSelection,
  type QuickMixSectionSummary,
} from "../../domain/quickMixSection.ts";
import { validateAudioFile } from "../audioMetadata.ts";
import { prepareQuickMixSourceFile } from "../localEngine/quickMixSourcePrep.ts";
import { localEngineClient } from "../localEngine/client.ts";
import type { LocalEngineConnectionStatus } from "../localEngine/types.ts";
import { LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS } from "../localEngine/types.ts";
import type { StemPreviewResult } from "../../domain/stemPreview.ts";
import type { FullLengthExportResult } from "../../domain/fullLengthExport.ts";

export interface QuickMixRunInput {
  vocalFile: File;
  instrumentalFile: File;
  vocalSection: QuickMixSectionSelection;
  instrumentalSection: QuickMixSectionSelection;
  vocalDurationSeconds: number | null;
  instrumentalDurationSeconds: number | null;
  arrangementStyle: ArrangementStyle;
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

async function snapshotMixFile(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  return new File([buffer], file.name, {
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified,
  });
}

async function prepareSourceForQuickMix(
  file: File,
  slot: QuickMixUploadSlot,
  section: QuickMixSectionSelection,
  sourceDurationSeconds: number | null
): Promise<{ file: File; summary: QuickMixSectionSummary; prepared: boolean }> {
  const validationErrors = validateQuickMixSectionAgainstDuration(section, sourceDurationSeconds);
  if (validationErrors.length > 0) {
    throw mapQuickMixError({
      message: validationErrors[0] ?? "Quick Mix section selection is invalid.",
      failedStepId: "checking_files",
      validationErrors,
    });
  }

  const outputDurationSeconds = effectiveQuickMixWindowSeconds(section, sourceDurationSeconds);

  if (!shouldPrepareQuickMixSourceForSection(section, sourceDurationSeconds)) {
    return {
      file,
      prepared: false,
      summary: {
        slot,
        selection: section,
        sourceDurationSeconds,
        outputDurationSeconds,
      },
    };
  }

  const prepared = await prepareQuickMixSourceFile(file, {
    startOffsetSeconds: section.startOffsetSeconds,
    maxSeconds: section.windowSeconds,
  });

  return {
    file: prepared.file,
    prepared: true,
    summary: {
      slot,
      selection: section,
      sourceDurationSeconds: prepared.sourceDurationSeconds,
      outputDurationSeconds: prepared.outputDurationSeconds ?? outputDurationSeconds,
    },
  };
}

async function requireQuickMixSidecar(
  failedStepId: QuickMixStepId
): Promise<LocalEngineConnectionStatus> {
  const connection = await localEngineClient.probeConnection();
  if (!connection.online || !connection.health?.ok) {
    throw mapQuickMixSidecarFailure(
      connection.error ?? "Local helper service is offline.",
      failedStepId
    );
  }
  return connection;
}

function demucsAvailableFromCapabilities(
  capabilities: LocalEngineConnectionStatus["capabilities"]
): boolean {
  return isDemucsAvailable(capabilities);
}

async function runStemStep(
  source: QuickMixSource,
  file: File,
  section: QuickMixSectionSelection,
  prepared: boolean,
  outputDurationSeconds: number | null,
  demucsAvailable: boolean
): Promise<StemPreviewResult> {
  const stemSection: QuickMixSectionSelection = prepared
    ? { ...section, startOffsetSeconds: 0 }
    : section;
  const params = buildQuickMixStemRequestParams(source, file, stemSection, prepared);
  if (prepared && outputDurationSeconds !== null) {
    params.maxPreviewSeconds = Math.min(
      section.windowSeconds,
      Math.max(1, Math.round(outputDurationSeconds))
    );
  } else if (!prepared && outputDurationSeconds !== null) {
    params.maxPreviewSeconds = Math.min(
      section.windowSeconds,
      Math.max(1, Math.round(outputDurationSeconds))
    );
  }

  const clientErrors = validateQuickMixStemRequest(params);
  if (clientErrors.length > 0) {
    throwMapped(
      mapQuickMixStemFailure(
        {
          message: "Stem preview settings were rejected before sending.",
          status: "validation_error",
          validationErrors: clientErrors,
        },
        source,
        { demucsAvailable }
      )
    );
  }

  const result = await requestStemPreviewWithRetry(file, params, source, demucsAvailable);
  return finalizeStemStep(result, source, demucsAvailable);
}

async function requestStemPreviewWithRetry(
  file: File,
  params: ReturnType<typeof buildQuickMixStemRequestParams>,
  source: QuickMixSource,
  demucsAvailable: boolean
): Promise<StemPreviewResult> {
  const failedStepId = source === "vocal" ? "separating_vocal" : "preparing_instrumental";
  const retryDelaysMs = [0, 3000, 8000];

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) {
      await requireQuickMixSidecar(failedStepId);
      await new Promise((resolve) => window.setTimeout(resolve, retryDelaysMs[attempt]));
    }

    const result = await localEngineClient.processStemPreview(file, params, {
      timeoutMs: LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS,
    });
    if (result) {
      return result;
    }
  }

  throwMapped(mapQuickMixNoResponseStemFailure(source, { demucsAvailable, timedOut: true }));
}

function finalizeStemStep(
  result: StemPreviewResult,
  source: QuickMixSource,
  demucsAvailable: boolean
): StemPreviewResult {
  if (!result.ok || !result.artifactId || !result.audioProcessed) {
    throwMapped(
      mapQuickMixStemFailure(result, source, {
        demucsAvailable,
      })
    );
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
        source,
        { demucsAvailable }
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

  let connection: LocalEngineConnectionStatus | null = null;
  let demucsAvailable = false;
  let sectionNotice: string | null = null;

  try {
    setStep("checking_files");

    const vocalFile = await snapshotMixFile(input.vocalFile);
    const instrumentalFile = await snapshotMixFile(input.instrumentalFile);

    const validation = validateQuickMixUploads({
      vocalFile,
      vocalFileName: vocalFile.name,
      instrumentalFile,
      instrumentalFileName: instrumentalFile.name,
      vocalPreparing: false,
      instrumentalPreparing: false,
    });
    if (!validation.ok) {
      throw mapQuickMixError({
        message: validation.message,
        failedStepId: "checking_files",
      });
    }

    for (const file of [vocalFile, instrumentalFile]) {
      const fileCheck = validateAudioFile(file);
      if (!fileCheck.ok) {
        throw mapQuickMixError({
          message: fileCheck.message,
          failedStepId: "checking_files",
        });
      }
    }

    connection = await requireQuickMixSidecar("checking_files");
    demucsAvailable = demucsAvailableFromCapabilities(connection.capabilities);

    const readiness = buildQuickMixReadiness({
      sidecarOnline: connection.online,
      capabilities: connection.capabilities,
    });
    if (!isQuickMixReady(readiness)) {
      throw mapQuickMixDependencyFailure(missingQuickMixDependencyLabels(readiness), "checking_files", {
        demucsAvailable,
      });
    }

    const vocalPrepared = await prepareSourceForQuickMix(
      vocalFile,
      "vocal",
      input.vocalSection,
      input.vocalDurationSeconds
    );
    const instrumentalPrepared = await prepareSourceForQuickMix(
      instrumentalFile,
      "instrumental",
      input.instrumentalSection,
      input.instrumentalDurationSeconds
    );

    const sectionSummaries = [vocalPrepared.summary, instrumentalPrepared.summary];
    const sectionSummaryLines = buildQuickMixSectionSummaryLines(sectionSummaries);
    sectionNotice = buildQuickMixSectionNotice(sectionSummaries);

    completeStep("checking_files");

    await requireQuickMixSidecar("separating_vocal");
    setStep("separating_vocal");
    const vocalStem = await runStemStep(
      "vocal",
      vocalPrepared.file,
      input.vocalSection,
      vocalPrepared.prepared,
      vocalPrepared.summary.outputDurationSeconds,
      demucsAvailable
    );
    completeStep("separating_vocal");

    await requireQuickMixSidecar("preparing_instrumental");
    setStep("preparing_instrumental");
    const beatStem = await runStemStep(
      "instrumental",
      instrumentalPrepared.file,
      input.instrumentalSection,
      instrumentalPrepared.prepared,
      instrumentalPrepared.summary.outputDurationSeconds,
      demucsAvailable
    );
    completeStep("preparing_instrumental");

    await requireQuickMixSidecar("matching_timing");
    setStep("matching_timing");
    const librosaUsed = librosaAvailableForQuickMix(connection.capabilities);
    let vocalBpm: number | null = null;
    let beatBpm: number | null = null;

    if (librosaUsed) {
      const vocalBeat = await localEngineClient.analyzeBeat(vocalPrepared.file);
      const beatBeat = await localEngineClient.analyzeBeat(instrumentalPrepared.file);
      vocalBpm = vocalBeat?.result?.bpm ?? null;
      beatBpm = beatBeat?.result?.bpm ?? null;
    }

    const stemIds = resolveQuickMixExportStemIds({ vocalStem, instrumentalStem: beatStem });
    if (!stemIds) {
      throw mapQuickMixError({
        message: "Could not resolve vocal and instrumental stem artifacts for export.",
        failedStepId: "matching_timing",
      });
    }

    const arrangementPlan = await localEngineClient.planArrangementBrain({
      sourceVocalStemArtifactId: stemIds.sourceVocalStemArtifactId,
      targetInstrumentalStemArtifactId: stemIds.targetInstrumentalStemArtifactId,
      arrangementMode: input.arrangementStyle,
      sectionStartSec: input.vocalSection.startOffsetSeconds,
      sectionDurationSec: input.vocalSection.windowSeconds,
    });

    const brainPlan = arrangementPlan;

    const strategy =
      brainPlan?.ok && brainPlan.tempoRatio
        ? buildQuickMixTimingStrategyFromBrain({
            vocalBpm,
            beatBpm,
            tempoRatio: brainPlan.tempoRatio,
            pitchShiftSemitones: brainPlan.pitchShiftSemitones,
            planSummary: brainPlan.arrangementSummary
              ? {
                  tempo_label: brainPlan.arrangementSummary.tempo_label,
                  key_label: brainPlan.arrangementSummary.key_label,
                  warnings: brainPlan.arrangementSummary.warnings,
                  score: brainPlan.arrangementSummary.score,
                  confidence_tier: brainPlan.arrangementSummary.confidence_tier,
                }
              : null,
            librosaUsed,
          })
        : buildQuickMixTimingStrategy({
            vocalBpm,
            beatBpm,
            pitchShiftSemitones: brainPlan?.pitchShiftSemitones ?? 0,
            librosaUsed,
          });

    const alignmentOffsetMs =
      brainPlan?.ok && brainPlan.alignmentOffsetMs !== null
        ? brainPlan.alignmentOffsetMs
        : 0;

    const context = buildQuickMixDirectionContext({
      vocalStemArtifactId: stemIds.sourceVocalStemArtifactId,
      beatStemArtifactId: stemIds.targetInstrumentalStemArtifactId,
      strategy,
      alignmentOffsetMs,
    });

    completeStep("matching_timing");

    await requireQuickMixSidecar("mixing_track");
    setStep("mixing_track");
    completeStep("mixing_track");

    await requireQuickMixSidecar("creating_wav_export");
    setStep("creating_wav_export");

    const exportParams = buildFullLengthExportRequestParams(
      context,
      strategy.useNeutralProcessing,
      strategy.confirmNeutralSettings,
      "measurement_only",
      QUICK_MIX_DEFAULT_MIX_SETTINGS,
      "quick-mix"
    );

    const wavExport: FullLengthExportResult | null =
      brainPlan?.ok && brainPlan.arrangementPlan
        ? await localEngineClient.createArrangementWavExport({
            ...exportParams,
            arrangementPlan: brainPlan.arrangementPlan,
          })
        : await localEngineClient.createFullWavExport(exportParams);
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
      mp3SkippedReason = mp3SkippedMessageAfterWavSuccess(mp3Export?.message ?? null);
    }

    completeStep("creating_mp3_reference");

    steps = succeedQuickMixProgress(steps);
    onProgress([...steps]);

    const remixBrainCard = buildQuickMixRemixBrainCard(
      brainPlan?.remixPlanSummary
        ? {
            mode: "clean_blend",
            mode_label: "Remix Brain",
            score: Number(brainPlan.remixPlanSummary.score ?? 0),
            confidence_tier:
              (brainPlan.remixPlanSummary.confidence_tier as "high" | "medium" | "low") ??
              "medium",
            sync_label: String(brainPlan.remixPlanSummary.sync_label ?? ""),
            tempo_label: String(brainPlan.remixPlanSummary.tempo_label ?? ""),
            key_label: String(brainPlan.remixPlanSummary.key_label ?? ""),
            warnings: Array.isArray(brainPlan.remixPlanSummary.warnings)
              ? brainPlan.remixPlanSummary.warnings.map(String)
              : [],
            reason_summary: "",
            score_breakdown: {},
            vocal_anchor_sec: 0,
            instrumental_anchor_sec: 0,
            vocal_anchor_type: "phrase",
            instrumental_anchor_type: "phrase",
            shift_seconds: 0,
          }
        : null,
      wavExport.processingSummary?.alignmentOffsetMs ?? alignmentOffsetMs
    );

    const arrangementCard = buildQuickMixArrangementCard(
      brainPlan?.arrangementSummary ?? null,
      brainPlan?.arrangementPlan ?? null
    );

    const output: QuickMixOutputModel = {
      wavPlaybackUrl: wavExport.playbackUrl,
      wavDownloadUrl: wavExport.downloadUrl,
      mp3PlaybackUrl,
      mp3DownloadUrl,
      exportLabel: QUICK_MIX_OUTPUT_LABEL,
      timingNotice: strategy.timingNotice,
      durationCapNotice: sectionNotice,
      sectionNotice,
      sectionSummaryLines,
      wavArtifactId: wavExport.exportArtifactId,
      mp3ArtifactId,
      durationSeconds: wavExport.durationSeconds,
      mixProfileSummary: buildQuickMixMixProfileSummary(QUICK_MIX_DEFAULT_MIX_SETTINGS),
      loudnessNotice: buildQuickMixLoudnessNotice(wavExport.loudness),
      loudnessWarnings: buildQuickMixLoudnessWarnings(wavExport.loudness, wavExport.warnings),
      listeningComparisonNotes: buildQuickMixListeningComparisonNotes(
        QUICK_MIX_RC2_BASELINE_MIX_SETTINGS,
        QUICK_MIX_DEFAULT_MIX_SETTINGS
      ),
      mp3SkippedReason,
      remixBrainCard,
      arrangementCard,
      technicalSummary: [
        QUICK_MIX_LISTENING_MIX_NOTICE,
        ...buildQuickMixListeningComparisonNotes(
          QUICK_MIX_RC2_BASELINE_MIX_SETTINGS,
          QUICK_MIX_DEFAULT_MIX_SETTINGS
        ),
        buildQuickMixMixProfileSummary(QUICK_MIX_DEFAULT_MIX_SETTINGS),
        formatQuickMixLoudnessTechnicalLine(wavExport.loudness) ??
          "Loudness: not_available for this export.",
        sectionNotice ?? "First 3:00 sections — Quick Mix MVP cap (180 seconds).",
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
      "checking_files";
    steps = failQuickMixProgress(steps, failedStep);
    onProgress([...steps]);

    return { ok: false, output: null, error: mapped, steps };
  }
}
