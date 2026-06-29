import { AlertTriangle, Headphones, LoaderCircle, Mic2, Music } from "lucide-react";
import { useState } from "react";
import {
  buildStemPreviewRequestParams,
  formatStemPreviewStatusMessage,
  isStemPreviewReady,
  STEM_PREVIEW_ONLY_NOTICE,
  STEM_PROCESSED_LABEL,
  type StemPreviewResult,
} from "../domain/stemPreview.ts";
import type { SlotId, TrackState } from "../domain/types.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { demucsCapabilitySummary, isDemucsAvailable } from "../lib/localEngine/capabilities.ts";
import { validateStemPreviewRequestParams } from "../lib/localEngine/stemPreview.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";

interface StemPreviewPanelProps {
  tracks: TrackState[];
  onStemPreviewComplete?: (slotId: SlotId, artifactId: string) => void;
}

const SLOT_OPTIONS: Array<{ id: SlotId; label: string }> = [
  { id: "trackA", label: "Track A" },
  { id: "trackB", label: "Track B" },
];

export function StemPreviewPanel({ tracks, onStemPreviewComplete }: StemPreviewPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const demucs = demucsCapabilitySummary(localStatus.capabilities);
  const demucsAvailable = isDemucsAvailable(localStatus.capabilities);

  const [selectedSlot, setSelectedSlot] = useState<SlotId>("trackA");
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<Partial<Record<SlotId, StemPreviewResult | null>>>({});

  const selectedTrack = tracks.find((track) => track.slotId === selectedSlot) ?? null;
  const readiness = isStemPreviewReady({
    sidecarOnline: localStatus.online,
    demucsAvailable,
    trackFile: selectedTrack?.file ?? null,
  });
  const result = results[selectedSlot] ?? null;

  async function handleCreatePreview() {
    if (!selectedTrack?.file) {
      return;
    }

    const params = buildStemPreviewRequestParams(selectedSlot, selectedTrack.file);
    const validationErrors = validateStemPreviewRequestParams(params);
    if (validationErrors.length > 0) {
      setResults((current) => ({
        ...current,
        [selectedSlot]: {
          ok: false,
          status: "validation_error",
          message: "Stem preview request failed client-side validation.",
          method: null,
          audioProcessed: false,
          artifactId: null,
          inputSummary: null,
          vocals: null,
          noVocals: null,
          warnings: [],
          limitations: [STEM_PREVIEW_ONLY_NOTICE],
          setupGuidance: null,
          validationErrors,
          isPreviewOnly: true,
        },
      }));
      return;
    }

    setProcessing(true);
    const response = await localEngineClient.processStemPreview(selectedTrack.file, params);
    setProcessing(false);
    const resolved =
      response ??
      ({
        ok: false,
        status: "request_failed",
        message: "Stem preview request failed. Check that the local sidecar is running.",
        method: null,
        audioProcessed: false,
        artifactId: null,
        inputSummary: null,
        vocals: null,
        noVocals: null,
        warnings: [],
        limitations: [STEM_PREVIEW_ONLY_NOTICE],
        setupGuidance: null,
        validationErrors: [],
        isPreviewOnly: true,
      } satisfies StemPreviewResult);

    if (resolved.ok && resolved.artifactId) {
      onStemPreviewComplete?.(selectedSlot, resolved.artifactId);
    }

    setResults((current) => ({
      ...current,
      [selectedSlot]: resolved,
    }));
  }

  if (tracks.length === 0) {
    return (
      <section className="stem-preview-panel stem-preview-panel-empty">
        <p>Upload at least one track to create a vocal/instrumental stem preview.</p>
      </section>
    );
  }

  return (
    <section className="stem-preview-panel" aria-label="Stem separation preview">
      <div className="stem-preview-header">
        <Headphones aria-hidden="true" size={20} />
        <div>
          <h3>Vocal / Instrumental Preview</h3>
          <p>{STEM_PREVIEW_ONLY_NOTICE}</p>
          <p className="stem-preview-note">
            One track at a time. Demucs two-stem mode (vocals + no_vocals). Not a final export or
            layered mashup.
          </p>
        </div>
        <span className={`planning-badge planning-badge-${demucsBadgeClass(demucs.status)}`}>
          Demucs: {demucs.status}
        </span>
      </div>

      <p className="stem-preview-capability-note">{demucs.message}</p>

      <div className="stem-preview-controls">
        <label className="stem-preview-track-label" htmlFor="stem-preview-track">
          Source track
        </label>
        <select
          id="stem-preview-track"
          onChange={(event) => setSelectedSlot(event.currentTarget.value as SlotId)}
          value={selectedSlot}
        >
          {SLOT_OPTIONS.filter((option) => tracks.some((track) => track.slotId === option.id)).map(
            (option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            )
          )}
        </select>
        <span className="stem-preview-file-note">
          {selectedTrack?.file.name ?? "No file loaded for this slot."}
        </span>
      </div>

      <dl className="stem-preview-params">
        <div>
          <dt>Split mode</dt>
          <dd>vocals + no_vocals</dd>
        </div>
        <div>
          <dt>Max preview</dt>
          <dd>60 seconds</dd>
        </div>
        <div>
          <dt>Engine</dt>
          <dd>Demucs two-stems vocals</dd>
        </div>
      </dl>

      <button
        className="stem-preview-button"
        disabled={!readiness.ready || processing}
        onClick={() => void handleCreatePreview()}
        type="button"
      >
        {processing ? (
          <>
            <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
            Separating stems…
          </>
        ) : (
          <>
            <Mic2 aria-hidden="true" size={18} />
            Create vocal/instrumental preview
          </>
        )}
      </button>

      {!readiness.ready ? (
        <p className="stem-preview-disabled-note">{readiness.reason}</p>
      ) : (
        <p className="stem-preview-action-note">
          User action required — stem separation does not run automatically after upload.
        </p>
      )}

      {result ? (
        <div
          className={`stem-preview-result ${result.ok ? "success" : "error"}`}
          aria-live="polite"
        >
          <p>{formatStemPreviewStatusMessage(result)}</p>
          {result.setupGuidance ? <p>{result.setupGuidance}</p> : null}
          {result.validationErrors.length > 0 ? (
            <ul>
              {result.validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {result.warnings.map((warning) => (
            <div className="planning-warning" key={warning}>
              <AlertTriangle aria-hidden="true" size={18} />
              <span>{warning}</span>
            </div>
          ))}

          {result.ok && result.audioProcessed && result.vocals && result.noVocals ? (
            <div className="stem-preview-playback-grid">
              <p className="stem-preview-artifact-label">{STEM_PROCESSED_LABEL}</p>
              <article className="stem-preview-playback-card">
                <div className="stem-preview-playback-header">
                  <Mic2 aria-hidden="true" size={18} />
                  <strong>Vocals preview</strong>
                </div>
                <audio controls preload="none" src={result.vocals.playbackUrl ?? undefined} />
              </article>
              <article className="stem-preview-playback-card">
                <div className="stem-preview-playback-header">
                  <Music aria-hidden="true" size={18} />
                  <strong>Instrumental preview (no_vocals)</strong>
                </div>
                <audio controls preload="none" src={result.noVocals.playbackUrl ?? undefined} />
              </article>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function demucsBadgeClass(status: string): string {
  switch (status) {
    case "available":
      return "strong";
    case "missing":
    case "not_configured":
      return "risky";
    default:
      return "unknown";
  }
}
