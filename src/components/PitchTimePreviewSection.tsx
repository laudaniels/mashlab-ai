import { AlertTriangle, Headphones, LoaderCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import {
  buildPreviewRequestParams,
  formatPreviewStatusMessage,
  isPreviewProcessingReady,
  PREVIEW_ONLY_NOTICE,
  PREVIEW_PROCESSED_LABEL,
  resolvePreviewDirections,
  type PitchTimePreviewResult,
} from "../domain/pitchTimePreview.ts";
import type { MashIntent, PitchTimePlanModel, RubberBandReadiness } from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import type { TrackState } from "../domain/types.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { validatePreviewRequestParams } from "../lib/localEngine/pitchTimePreview.ts";
import type { LocalEngineConnectionStatus } from "../lib/localEngine/types.ts";

interface PitchTimePreviewSectionProps {
  artifactStore: SessionArtifactStore;
  intent: MashIntent;
  plan: PitchTimePlanModel;
  tracks: TrackState[];
  localStatus: LocalEngineConnectionStatus;
  rubberBandStatus: RubberBandReadiness;
}

export function PitchTimePreviewSection({
  artifactStore,
  intent,
  plan,
  tracks,
  localStatus,
  rubberBandStatus,
}: PitchTimePreviewSectionProps) {
  const previewDirections = resolvePreviewDirections(plan, artifactStore, intent);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PitchTimePreviewResult | null>>({});

  async function handleCreatePreview(directionKey: string, vocalTrack: TrackState | null) {
    const entry = previewDirections.find((item) => item.direction.intentLabel === directionKey);
    if (!entry || !vocalTrack?.file) {
      return;
    }

    const readiness = isPreviewProcessingReady({
      sidecarOnline: localStatus.online,
      rubberBandStatus,
      direction: entry.direction,
      vocalTrack,
    });

    if (!readiness.ready) {
      setResults((current) => ({
        ...current,
        [directionKey]: {
          ok: false,
          status: "not_ready",
          message: readiness.reason,
          method: null,
          audioProcessed: false,
          inputSummary: null,
          outputSummary: null,
          artifactUrl: null,
          artifactPlaybackUrl: null,
          warnings: [],
          limitations: [PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors: [],
          isPreviewOnly: true,
        },
      }));
      return;
    }

    const params = buildPreviewRequestParams(entry.direction, vocalTrack);
    const validationErrors = validatePreviewRequestParams(params);
    if (validationErrors.length > 0) {
      setResults((current) => ({
        ...current,
        [directionKey]: {
          ok: false,
          status: "validation_error",
          message: "Preview request failed client-side validation.",
          method: null,
          audioProcessed: false,
          inputSummary: null,
          outputSummary: null,
          artifactUrl: null,
          artifactPlaybackUrl: null,
          warnings: [],
          limitations: [PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors,
          isPreviewOnly: true,
        },
      }));
      return;
    }

    setProcessingKey(directionKey);
    const result = await localEngineClient.processPitchTimePreview(vocalTrack.file, params);
    setProcessingKey(null);
    setResults((current) => ({
      ...current,
      [directionKey]:
        result ??
        ({
          ok: false,
          status: "request_failed",
          message: "Preview request failed. Check that the local sidecar is running.",
          method: null,
          audioProcessed: false,
          inputSummary: null,
          outputSummary: null,
          artifactUrl: null,
          artifactPlaybackUrl: null,
          warnings: [],
          limitations: [PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors: [],
          isPreviewOnly: true,
        } satisfies PitchTimePreviewResult),
    }));
  }

  return (
    <section className="pitch-time-preview-section" aria-label="Pitch and time preview processing">
      <div className="pitch-time-preview-header">
        <Headphones aria-hidden="true" size={20} />
        <div>
          <h4>Processed preview lane</h4>
          <p>{PREVIEW_ONLY_NOTICE}</p>
          <p className="pitch-time-preview-stem-note">
            Stems are not separated yet. Preview processing applies pitch/time to the selected source
            track only — not a layered mashup.
          </p>
        </div>
      </div>

      <div className="pitch-time-preview-grid">
        {previewDirections.map(({ direction, vocalSlotId }) => {
          const vocalTrack = tracks.find((track) => track.slotId === vocalSlotId) ?? null;
          const readiness = isPreviewProcessingReady({
            sidecarOnline: localStatus.online,
            rubberBandStatus,
            direction,
            vocalTrack,
          });
          const result = results[direction.intentLabel] ?? null;
          const isProcessing = processingKey === direction.intentLabel;

          return (
            <article className="pitch-time-preview-card" key={direction.intentLabel}>
              <h5>{direction.intentLabel}</h5>
              <p className="pitch-time-preview-source">
                Source track: {vocalTrack?.label ?? "Unavailable"} ({vocalTrack?.file.name ?? "—"})
              </p>

              <dl className="pitch-time-preview-params">
                <div>
                  <dt>Tempo ratio</dt>
                  <dd>{direction.tempoStretchRatio ?? "—"}</dd>
                </div>
                <div>
                  <dt>Pitch shift</dt>
                  <dd>
                    {direction.suggestedPitchShiftSemitones === null
                      ? "—"
                      : `${direction.suggestedPitchShiftSemitones} semitones`}
                  </dd>
                </div>
                <div>
                  <dt>Max preview</dt>
                  <dd>30 seconds</dd>
                </div>
              </dl>

              {direction.safeRangeWarning ? (
                <div className="planning-warning">
                  <AlertTriangle aria-hidden="true" size={18} />
                  <span>{direction.safeRangeWarning}</span>
                </div>
              ) : null}

              <button
                className="pitch-time-preview-button"
                disabled={!readiness.ready || isProcessing}
                onClick={() => void handleCreatePreview(direction.intentLabel, vocalTrack)}
                type="button"
              >
                {isProcessing ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
                    Processing preview…
                  </>
                ) : (
                  <>
                    <PlayCircle aria-hidden="true" size={18} />
                    Create pitch/time preview
                  </>
                )}
              </button>

              {!readiness.ready ? (
                <p className="pitch-time-preview-disabled-note">{readiness.reason}</p>
              ) : (
                <p className="pitch-time-preview-action-note">
                  User action required — preview does not run automatically after upload.
                </p>
              )}

              {result ? (
                <div
                  className={`pitch-time-preview-result ${result.ok ? "success" : "error"}`}
                  aria-live="polite"
                >
                  <p>{formatPreviewStatusMessage(result)}</p>
                  {result.setupGuidance ? <p>{result.setupGuidance}</p> : null}
                  {result.validationErrors.length > 0 ? (
                    <ul>
                      {result.validationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                  {result.warnings.map((warning) => (
                    <p className="pitch-time-preview-warning" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {result.ok && result.audioProcessed && result.artifactPlaybackUrl ? (
                    <div className="pitch-time-preview-playback">
                      <p className="pitch-time-preview-artifact-label">{PREVIEW_PROCESSED_LABEL}</p>
                      <audio controls preload="none" src={result.artifactPlaybackUrl} />
                      {result.inputSummary && result.outputSummary ? (
                        <dl className="pitch-time-preview-metadata">
                          <div>
                            <dt>Input duration</dt>
                            <dd>{formatSeconds(result.inputSummary.durationSeconds)}</dd>
                          </div>
                          <div>
                            <dt>Output duration</dt>
                            <dd>{formatSeconds(result.outputSummary.durationSeconds)}</dd>
                          </div>
                          <div>
                            <dt>Artifact</dt>
                            <dd>{result.outputSummary.fileName}</dd>
                          </div>
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(1)}s`;
}
