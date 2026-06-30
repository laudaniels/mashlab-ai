import { AlertTriangle, LoaderCircle, Stethoscope } from "lucide-react";
import { useState } from "react";
import {
  advancedEngineAvailableFromSelfTest,
  formatRhythmEngineSelfTestLine,
  formatRhythmSelfTestStatus,
  RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE,
  type RhythmSelfTestResponse,
} from "../domain/rhythmSelfTest.ts";
import {
  VERIFIED_RHYTHM_LABEL_NOTICE,
  WINDOWS_MVP_RHYTHM_NOTICE,
  WSL_OPTIONAL_RHYTHM_NOTICE,
} from "../domain/wslSidecarProfile.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import {
  isBeatnetAvailable,
  isEssentiaAvailable,
  isMadmomAvailable,
  verifiedPhraseAnalysisAvailable,
} from "../lib/localEngine/capabilities.ts";
import type { ServiceCapability } from "../lib/localEngine/types.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";

interface RhythmSelfTestPanelProps {
  online: boolean;
  capabilities: ServiceCapability[];
  onSelfTestComplete?: (response: RhythmSelfTestResponse | null) => void;
}

export function RhythmSelfTestPanel({
  online,
  capabilities,
  onSelfTestComplete,
}: RhythmSelfTestPanelProps) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<RhythmSelfTestResponse | null>(null);

  async function handleRunSelfTest() {
    setBusy(true);
    setErrorMessage(null);

    const response = await localEngineClient.runRhythmSelfTest();
    setBusy(false);

    if (!response) {
      setErrorMessage("Local sidecar did not respond to rhythm self-test.");
      onSelfTestComplete?.(null);
      return;
    }

    setLastResponse(response);
    onSelfTestComplete?.(response);
  }

  const selfTestResults = lastResponse?.results ?? null;
  const essentiaAvailable = advancedEngineAvailableFromSelfTest(
    selfTestResults,
    "essentia",
    isEssentiaAvailable(capabilities)
  );
  const madmomAvailable = advancedEngineAvailableFromSelfTest(
    selfTestResults,
    "madmom",
    isMadmomAvailable(capabilities)
  );
  const beatnetAvailable = advancedEngineAvailableFromSelfTest(
    selfTestResults,
    "beatnet",
    isBeatnetAvailable(capabilities)
  );
  const verifiedAvailable =
    lastResponse?.verifiedPhraseAvailable ||
    lastResponse?.verifiedDownbeatAvailable ||
    verifiedPhraseAnalysisAvailable(capabilities);

  return (
    <section className="rhythm-selftest-panel" aria-label="Rhythm engine self-test">
      <div className="rhythm-selftest-header">
        <Stethoscope aria-hidden="true" size={18} />
        <div>
          <h4>Rhythm engine self-test</h4>
          <p>{RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE}</p>
          <p className="rhythm-selftest-platform-note">{WINDOWS_MVP_RHYTHM_NOTICE}</p>
          <p className="rhythm-selftest-platform-note">{WSL_OPTIONAL_RHYTHM_NOTICE}</p>
          <p className="rhythm-selftest-platform-note">{VERIFIED_RHYTHM_LABEL_NOTICE}</p>
        </div>
      </div>

      <button
        className="rhythm-selftest-run-button"
        disabled={!online || busy}
        onClick={() => void handleRunSelfTest()}
        type="button"
      >
        {busy ? (
          <>
            <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
            Running rhythm self-test…
          </>
        ) : (
          "Run rhythm self-test"
        )}
      </button>

      {errorMessage ? (
        <p className="rhythm-selftest-error" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          {errorMessage}
        </p>
      ) : null}

      {lastResponse ? (
        <div className="rhythm-selftest-results">
          <ul className="rhythm-selftest-summary">
            <li>
              Heuristic fallback:{" "}
              {lastResponse.heuristicFallbackAvailable ? "available" : "unavailable"}
            </li>
            <li>
              Verified downbeat/phrase: {verifiedAvailable ? "available on this host" : "not available"}
            </li>
            <li>
              Advanced engines (capability + self-test): Essentia {essentiaAvailable ? "yes" : "no"} ·
              madmom {madmomAvailable ? "yes" : "no"} · BeatNet+ {beatnetAvailable ? "yes" : "no"}
            </li>
          </ul>

          <ul className="rhythm-selftest-engine-list">
            {lastResponse.results.map((result) => (
              <li key={result.engineId} className={`rhythm-selftest-engine status-${result.smokeTestStatus}`}>
                <strong>{formatRhythmEngineSelfTestLine(result)}</strong>
                <span>{result.message}</span>
                <span className="rhythm-selftest-status-pill">
                  {formatRhythmSelfTestStatus(result.smokeTestStatus)}
                </span>
                {result.confidence !== null ? (
                  <span>Confidence: {(result.confidence * 100).toFixed(1)}%</span>
                ) : null}
                {result.limitations[0] ? (
                  <span className="rhythm-selftest-limitation">{result.limitations[0]}</span>
                ) : null}
                {result.setupGuidance && result.smokeTestStatus !== "pass" ? (
                  <span className="rhythm-selftest-setup">{result.setupGuidance}</span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="rhythm-selftest-rights">{lastResponse.rightsNotice || requiredRightsNotice}</p>
          <p className="rhythm-selftest-dj">DJ review required — self-test does not replace track-level review.</p>
        </div>
      ) : null}
    </section>
  );
}

export function rhythmSelfTestAvailability(
  selfTestResults: RhythmSelfTestResponse | null,
  capabilities: ServiceCapability[]
) {
  const results = selfTestResults?.results ?? null;
  return {
    essentia: advancedEngineAvailableFromSelfTest(results, "essentia", isEssentiaAvailable(capabilities)),
    madmom: advancedEngineAvailableFromSelfTest(results, "madmom", isMadmomAvailable(capabilities)),
    beatnet: advancedEngineAvailableFromSelfTest(results, "beatnet", isBeatnetAvailable(capabilities)),
    verifiedDownbeat: selfTestResults?.verifiedDownbeatAvailable ?? false,
    verifiedPhrase: selfTestResults?.verifiedPhraseAvailable ?? false,
  };
}
