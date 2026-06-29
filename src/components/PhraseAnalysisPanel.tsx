import { AlertTriangle, LoaderCircle, Music2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { PhraseAnalysisMethodPreference } from "../domain/phraseAnalysis.ts";
import {
  buildPhraseAnalysisComparison,
  formatPhraseAnalysisSummary,
  formatPhraseComparisonSummary,
  formatMissingPhraseDependency,
  PHRASE_ANALYSIS_DJ_REVIEW_NOTICE,
  type PhraseAnalysisComparison,
  type PhraseAnalysisResult,
} from "../domain/phraseAnalysis.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import type { SlotId, TrackState } from "../domain/types.ts";
import type { PhraseLengthBars } from "../domain/trackOverrides.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  findCapability,
  heuristicPhrasePlanningAvailable,
  phraseAnalysisCapabilitySummary,
  verifiedPhraseAnalysisAvailable,
} from "../lib/localEngine/capabilities.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import type { RhythmSelfTestResponse } from "../domain/rhythmSelfTest.ts";
import { RhythmSelfTestPanel, rhythmSelfTestAvailability } from "./RhythmSelfTestPanel.tsx";

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
  const [comparison, setComparison] = useState<PhraseAnalysisComparison | null>(null);
  const [selfTestResponse, setSelfTestResponse] = useState<RhythmSelfTestResponse | null>(null);

  const engineAvailability = rhythmSelfTestAvailability(selfTestResponse, localStatus.capabilities);

  const capabilitySummary = useMemo(
    () => phraseAnalysisCapabilitySummary(localStatus.capabilities),
    [localStatus.capabilities]
  );

  const selectedTrack = tracks.find((track) => track.slotId === selectedSlot) ?? null;
  const artifact = artifactStore.tracks[selectedSlot];

  const advancedAvailable =
    engineAvailability.essentia || engineAvailability.madmom || engineAvailability.beatnet;

  async function handleRunPhraseAnalysis() {
    if (!selectedTrack) {
      setErrorMessage("Select a track with uploaded audio first.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setLastResult(null);
    setComparison(null);

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
    setComparison(
      buildPhraseAnalysisComparison({
        result,
        beatTimes: beatTimes.length > 0 ? beatTimes : result.beatTimes,
        bpm: bpm ?? result.bpm,
        phraseLengthBars,
        advancedAvailable: advancedAvailable,
        setupGuidance: findCapability(localStatus.capabilities, "essentia")?.message ?? null,
      })
    );
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
            <option value="essentia" disabled={!engineAvailability.essentia}>
              Essentia {engineAvailability.essentia ? "" : "(not installed / self-test not passed)"}
            </option>
            <option value="beatnet" disabled={!engineAvailability.beatnet}>
              BeatNet+ {engineAvailability.beatnet ? "" : "(not installed / stub)"}
            </option>
            <option value="madmom" disabled={!engineAvailability.madmom}>
              madmom {engineAvailability.madmom ? "" : "(not installed / self-test not passed)"}
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

      <RhythmSelfTestPanel
        capabilities={localStatus.capabilities}
        online={localStatus.online}
        onSelfTestComplete={setSelfTestResponse}
      />

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

      {lastResult && comparison ? (
        <div className="phrase-analysis-result">
          <h4>Analysis result</h4>
          <ul>
            {formatPhraseAnalysisSummary(lastResult).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div className="phrase-analysis-comparison">
            <h4>Heuristic vs advanced comparison</h4>
            <div className="phrase-analysis-comparison-grid">
              <article className="phrase-analysis-comparison-lane">
                <h5>{comparison.heuristic.label}</h5>
                <p className="phrase-analysis-basis">{comparison.heuristic.basisLabel}</p>
                <p>Method: {comparison.heuristic.method}</p>
                <p>Phrase windows: {comparison.heuristic.phraseStartTimes.length}</p>
                <p>Downbeats: none (heuristic)</p>
                {comparison.heuristic.limitations[0] ? (
                  <p className="phrase-analysis-limitation">{comparison.heuristic.limitations[0]}</p>
                ) : null}
              </article>

              {comparison.advanced ? (
                <article className="phrase-analysis-comparison-lane phrase-analysis-comparison-lane-advanced">
                  <h5>{comparison.advanced.label}</h5>
                  <p className="phrase-analysis-basis">{comparison.advanced.basisLabel}</p>
                  <p>Method: {comparison.advanced.method}</p>
                  <p>Phrase windows: {comparison.advanced.phraseStartTimes.length}</p>
                  <p>
                    Downbeats:{" "}
                    {comparison.advanced.downbeatCount > 0
                      ? comparison.advanced.downbeatCount
                      : "none detected"}
                  </p>
                  {comparison.advanced.confidence !== null ? (
                    <p>Confidence: {(comparison.advanced.confidence * 100).toFixed(1)}%</p>
                  ) : null}
                  {comparison.advanced.limitations[0] ? (
                    <p className="phrase-analysis-limitation">{comparison.advanced.limitations[0]}</p>
                  ) : null}
                </article>
              ) : (
                <article className="phrase-analysis-comparison-lane phrase-analysis-comparison-lane-unavailable">
                  <h5>Advanced engine</h5>
                  <p className="phrase-analysis-basis">Unavailable</p>
                  <p>No verified rhythm engine result for this run.</p>
                  {comparison.setupGuidance ? (
                    <p className="phrase-analysis-setup">{comparison.setupGuidance}</p>
                  ) : null}
                </article>
              )}
            </div>
            <ul className="phrase-analysis-comparison-summary">
              {formatPhraseComparisonSummary(comparison).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

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
