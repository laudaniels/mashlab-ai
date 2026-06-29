import { AlertTriangle, LoaderCircle, Music2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { PhraseAnalysisMethodPreference } from "../domain/phraseAnalysis.ts";
import {
  formatPhraseAnalysisSummary,
  formatMissingPhraseDependency,
  PHRASE_ANALYSIS_DJ_REVIEW_NOTICE,
  type PhraseAnalysisResult,
} from "../domain/phraseAnalysis.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import type { SlotId, TrackState } from "../domain/types.ts";
import type { PhraseLengthBars } from "../domain/trackOverrides.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  findCapability,
  heuristicPhrasePlanningAvailable,
  isEssentiaAvailable,
  isBeatnetAvailable,
  isMadmomAvailable,
  phraseAnalysisCapabilitySummary,
  verifiedPhraseAnalysisAvailable,
} from "../lib/localEngine/capabilities.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";

interface PhraseAnalysisPanelProps {
  tracks: TrackState[];
  artifactStore: SessionArtifactStore;
  onPhraseAnalysisComplete: (slotId: SlotId, result: PhraseAnalysisResult | null) => void;
}

const PHRASE_LENGTH_OPTIONS: PhraseLengthBars[] = [4, 8, 16];

export function PhraseAnalysisPanel({
  tracks,
  artifactStore,
  onPhraseAnalysisComplete,
}: PhraseAnalysisPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const [selectedSlot, setSelectedSlot] = useState<SlotId>("trackA");
  const [method, setMethod] = useState<PhraseAnalysisMethodPreference>("auto");
  const [phraseLengthBars, setPhraseLengthBars] = useState<PhraseLengthBars>(8);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PhraseAnalysisResult | null>(null);

  const capabilitySummary = useMemo(
    () => phraseAnalysisCapabilitySummary(localStatus.capabilities),
    [localStatus.capabilities]
  );

  const selectedTrack = tracks.find((track) => track.slotId === selectedSlot) ?? null;
  const artifact = artifactStore.tracks[selectedSlot];

  const advancedAvailable =
    isEssentiaAvailable(localStatus.capabilities) ||
    isBeatnetAvailable(localStatus.capabilities) ||
    isMadmomAvailable(localStatus.capabilities);

  async function handleRunPhraseAnalysis() {
    if (!selectedTrack) {
      setErrorMessage("Select a track with uploaded audio first.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setLastResult(null);

    const beatTimes = artifact?.beatAnalysis?.beatTimes ?? [];
    const bpm = artifact?.beatAnalysis?.bpm ?? null;

    const { response, result } = await localEngineClient.analyzePhrases({
      file: beatTimes.length > 0 ? null : selectedTrack.file,
      bpm,
      beatTimes: beatTimes.length > 0 ? beatTimes : undefined,
      phraseLengthBars,
      method,
    });

    setBusy(false);

    if (!response) {
      setErrorMessage("Local sidecar did not respond to phrase analysis request.");
      return;
    }

    if (!response.ok || !result) {
      setErrorMessage(
        response.validation_errors?.join(" ") ??
          response.setup_guidance ??
          response.message ??
          "Phrase analysis failed."
      );
      return;
    }

    setLastResult(result);
    onPhraseAnalysisComplete(selectedSlot, result);
  }

  if (tracks.length === 0) {
    return null;
  }

  return (
    <section className="phrase-analysis-panel" aria-label="Phrase analysis">
      <div className="phrase-analysis-header">
        <Music2 aria-hidden="true" size={20} />
        <div>
          <h3>Phrase Analysis</h3>
          <p>
            Optional phrase/downbeat analysis upgrade path. Heuristic fallback when advanced engines are
            missing. Not verse/chorus/drop detection.
          </p>
          <p className="phrase-analysis-rights">{requiredRightsNotice}</p>
        </div>
      </div>

      <p className="phrase-analysis-capability">{capabilitySummary.message}</p>

      <ul className="phrase-analysis-deps">
        <li>
          Heuristic planning:{" "}
          {heuristicPhrasePlanningAvailable(localStatus.capabilities) ? "available" : "unavailable"}
        </li>
        <li>
          Verified phrase/downbeat:{" "}
          {verifiedPhraseAnalysisAvailable(localStatus.capabilities) ? "available" : "planned / missing deps"}
        </li>
        {(["essentia", "beatnet", "madmom"] as const).map((id) => {
          const cap = findCapability(localStatus.capabilities, id);
          if (!cap) {
            return null;
          }
          return <li key={id}>{formatMissingPhraseDependency(cap)}</li>;
        })}
      </ul>

      <div className="phrase-analysis-form">
        <label className="phrase-analysis-field">
          <span>Track</span>
          <select
            disabled={busy}
            onChange={(event) => setSelectedSlot(event.target.value as SlotId)}
            value={selectedSlot}
          >
            {tracks.map((track) => (
              <option key={track.slotId} value={track.slotId}>
                {track.label} — {track.file.name}
              </option>
            ))}
          </select>
        </label>

        <label className="phrase-analysis-field">
          <span>Method</span>
          <select disabled={busy} onChange={(event) => setMethod(event.target.value as PhraseAnalysisMethodPreference)} value={method}>
            <option value="auto">Auto (advanced if available, else heuristic)</option>
            <option value="heuristic">Heuristic (from beat times)</option>
            <option value="essentia" disabled={!isEssentiaAvailable(localStatus.capabilities)}>
              Essentia {isEssentiaAvailable(localStatus.capabilities) ? "" : "(not installed)"}
            </option>
            <option value="beatnet" disabled={!isBeatnetAvailable(localStatus.capabilities)}>
              BeatNet+ {isBeatnetAvailable(localStatus.capabilities) ? "" : "(not installed)"}
            </option>
            <option value="madmom" disabled={!isMadmomAvailable(localStatus.capabilities)}>
              madmom {isMadmomAvailable(localStatus.capabilities) ? "" : "(not installed)"}
            </option>
          </select>
        </label>

        <fieldset className="phrase-analysis-length">
          <legend>Phrase length preference</legend>
          {PHRASE_LENGTH_OPTIONS.map((bars) => (
            <label key={bars}>
              <input
                checked={phraseLengthBars === bars}
                disabled={busy}
                name="phrase-length-bars"
                onChange={() => setPhraseLengthBars(bars)}
                type="radio"
              />
              {bars} bars
            </label>
          ))}
        </fieldset>

        <button
          className="phrase-analysis-run-button"
          disabled={!localStatus.online || busy || !selectedTrack}
          onClick={() => void handleRunPhraseAnalysis()}
          type="button"
        >
          {busy ? (
            <>
              <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
              Running phrase analysis…
            </>
          ) : (
            "Run phrase / downbeat analysis"
          )}
        </button>
      </div>

      {!advancedAvailable && method !== "heuristic" ? (
        <p className="phrase-analysis-note">
          Advanced rhythm engines not installed — Auto/heuristic will use beat-time phrase windows only.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="phrase-analysis-error" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          {errorMessage}
        </p>
      ) : null}

      {lastResult ? (
        <div className="phrase-analysis-result">
          <ul>
            {formatPhraseAnalysisSummary(lastResult).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{PHRASE_ANALYSIS_DJ_REVIEW_NOTICE}</p>
        </div>
      ) : null}

      {artifact?.phraseAnalysis ? (
        <p className="phrase-analysis-stored">
          Stored on track: {artifact.phraseAnalysis.methodUsed} · basis{" "}
          {artifact.phraseAnalysis.phraseBasis.replace(/_/g, " ")}
        </p>
      ) : null}
    </section>
  );
}
