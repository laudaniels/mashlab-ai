export type RhythmSelfTestStatus =
  | "pass"
  | "missing_dependency"
  | "not_configured"
  | "failed"
  | "not_implemented"
  | "skipped";

export interface RhythmEngineSelfTestResult {
  engineName: string;
  engineId: string;
  importStatus: string;
  smokeTestStatus: RhythmSelfTestStatus;
  beatMarkerCount: number;
  downbeatMarkerCount: number;
  phraseMarkerCount: number;
  basisLabel: string;
  confidence: number | null;
  bpm: number | null;
  limitations: string[];
  setupGuidance: string | null;
  message: string;
}

export interface RhythmSelfTestResponse {
  ok: boolean;
  service: string;
  pythonVersion: string;
  platform: string;
  noUserAudioProcessed: true;
  testSignal: string;
  djReviewRequired: true;
  heuristicFallbackAvailable: boolean;
  verifiedDownbeatAvailable: boolean;
  verifiedPhraseAvailable: boolean;
  results: RhythmEngineSelfTestResult[];
  rightsNotice: string;
  limitations: string[];
}

export const RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE =
  "No user audio is processed by this self-test. A synthetic click track is generated locally in .work/temp.";

export function formatRhythmSelfTestStatus(status: RhythmSelfTestStatus): string {
  return status.replace(/_/g, " ");
}

export function formatRhythmEngineSelfTestLine(result: RhythmEngineSelfTestResult): string {
  const markers = [
    result.beatMarkerCount > 0 ? `${result.beatMarkerCount} beats` : null,
    result.downbeatMarkerCount > 0 ? `${result.downbeatMarkerCount} downbeats` : null,
    result.phraseMarkerCount > 0 ? `${result.phraseMarkerCount} phrases` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const markerSuffix = markers ? ` · ${markers}` : "";
  return `${result.engineName}: ${formatRhythmSelfTestStatus(result.smokeTestStatus)} · ${result.basisLabel}${markerSuffix}`;
}

export function rhythmSelfTestClaimsVerifiedWithoutMarkers(result: RhythmEngineSelfTestResult): boolean {
  if (result.smokeTestStatus !== "pass") {
    return false;
  }
  if (result.basisLabel === "Verified phrase" && result.phraseMarkerCount === 0) {
    return true;
  }
  if (result.basisLabel === "Verified downbeat" && result.downbeatMarkerCount === 0) {
    return true;
  }
  return false;
}

export function enginePassedSelfTest(
  results: RhythmEngineSelfTestResult[],
  engineId: string
): boolean {
  return results.some(
    (item) => item.engineId === engineId && item.smokeTestStatus === "pass"
  );
}

export function advancedEngineAvailableFromSelfTest(
  results: RhythmEngineSelfTestResult[] | null,
  engineId: string,
  capabilityAvailable: boolean
): boolean {
  if (results && enginePassedSelfTest(results, engineId)) {
    return true;
  }
  return capabilityAvailable;
}

export function verifiedRhythmAvailableFromSelfTest(
  response: RhythmSelfTestResponse | null
): { downbeat: boolean; phrase: boolean } {
  if (!response) {
    return { downbeat: false, phrase: false };
  }
  return {
    downbeat: response.verifiedDownbeatAvailable,
    phrase: response.verifiedPhraseAvailable,
  };
}

export function formatRhythmSelfTestSummary(response: RhythmSelfTestResponse): string[] {
  const lines = [
    `Platform: ${response.platform}`,
    `Test signal: ${response.testSignal.replace(/_/g, " ")}`,
    `Heuristic fallback: ${response.heuristicFallbackAvailable ? "available" : "unavailable"}`,
    `Verified downbeat: ${response.verifiedDownbeatAvailable ? "available" : "not available"}`,
    `Verified phrase: ${response.verifiedPhraseAvailable ? "available" : "not available"}`,
    RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE,
  ];
  for (const result of response.results) {
    lines.push(formatRhythmEngineSelfTestLine(result));
    if (result.setupGuidance && result.smokeTestStatus !== "pass") {
      lines.push(`Setup: ${result.setupGuidance}`);
    }
  }
  return lines;
}
