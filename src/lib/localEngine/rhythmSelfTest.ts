import type {
  RhythmEngineSelfTestResult,
  RhythmSelfTestResponse,
  RhythmSelfTestStatus,
} from "../../domain/rhythmSelfTest.ts";

function parseSelfTestStatus(value: unknown): RhythmSelfTestStatus | null {
  if (
    value === "pass" ||
    value === "missing_dependency" ||
    value === "not_configured" ||
    value === "failed" ||
    value === "not_implemented" ||
    value === "skipped"
  ) {
    return value;
  }
  return null;
}

function parseEngineResult(value: unknown): RhythmEngineSelfTestResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const smokeTestStatus = parseSelfTestStatus(record.smoke_test_status);
  if (
    typeof record.engine_name !== "string" ||
    typeof record.engine_id !== "string" ||
    typeof record.import_status !== "string" ||
    !smokeTestStatus ||
    typeof record.basis_label !== "string" ||
    typeof record.message !== "string"
  ) {
    return null;
  }

  return {
    engineName: record.engine_name,
    engineId: record.engine_id,
    importStatus: record.import_status,
    smokeTestStatus,
    beatMarkerCount: typeof record.beat_marker_count === "number" ? record.beat_marker_count : 0,
    downbeatMarkerCount:
      typeof record.downbeat_marker_count === "number" ? record.downbeat_marker_count : 0,
    phraseMarkerCount:
      typeof record.phrase_marker_count === "number" ? record.phrase_marker_count : 0,
    basisLabel: record.basis_label,
    confidence: typeof record.confidence === "number" ? record.confidence : null,
    bpm: typeof record.bpm === "number" ? record.bpm : null,
    limitations: Array.isArray(record.limitations)
      ? record.limitations.filter((item): item is string => typeof item === "string")
      : [],
    setupGuidance: typeof record.setup_guidance === "string" ? record.setup_guidance : null,
    message: record.message,
  };
}

export function parseRhythmSelfTestResponse(payload: unknown): RhythmSelfTestResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    record.ok !== true ||
    typeof record.service !== "string" ||
    typeof record.python_version !== "string" ||
    typeof record.platform !== "string" ||
    record.no_user_audio_processed !== true ||
    typeof record.test_signal !== "string" ||
    record.dj_review_required !== true ||
    typeof record.heuristic_fallback_available !== "boolean" ||
    typeof record.verified_downbeat_available !== "boolean" ||
    typeof record.verified_phrase_available !== "boolean" ||
    typeof record.rights_notice !== "string" ||
    !Array.isArray(record.results)
  ) {
    return null;
  }

  const results = record.results
    .map(parseEngineResult)
    .filter((item): item is RhythmEngineSelfTestResult => item !== null);

  if (results.length !== record.results.length) {
    return null;
  }

  return {
    ok: true,
    service: record.service,
    pythonVersion: record.python_version,
    platform: record.platform,
    noUserAudioProcessed: true,
    testSignal: record.test_signal,
    djReviewRequired: true,
    heuristicFallbackAvailable: record.heuristic_fallback_available,
    verifiedDownbeatAvailable: record.verified_downbeat_available,
    verifiedPhraseAvailable: record.verified_phrase_available,
    results,
    rightsNotice: record.rights_notice,
    limitations: Array.isArray(record.limitations)
      ? record.limitations.filter((item): item is string => typeof item === "string")
      : [],
  };
}
