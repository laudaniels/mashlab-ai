import type { KeyAnalysisResult } from "../engines/contracts.ts";
import type { PlanningValueSource, TrackDjOverrides } from "./trackOverrides.ts";

export type CompatibilityLabel = "strong" | "compatible" | "risky" | "unknown";

export interface KeyProfile {
  key: string | null;
  mode: "major" | "minor" | "unknown";
  camelot: string | null;
  confidence: number | null;
  method?: string | null;
}

export interface EffectiveKeyProfile extends KeyProfile {
  keySource: PlanningValueSource;
  camelotSource: PlanningValueSource;
  isUserSupplied: boolean;
}

export interface HarmonicCompatibilityPlan {
  label: CompatibilityLabel;
  reason: string;
  suggestedVocalShiftSemitones: number | null;
  suggestedInstrumentalShiftSemitones: number | null;
  pitchShiftWarning: string | null;
  limitations: string[];
  djReviewRequired: true;
  experimentalKeyWarning: string | null;
}

export interface TempoCompatibilityPlan {
  trackABpm: number | null;
  trackBBpm: number | null;
  bpmDifference: number | null;
  adjustmentPlan: string;
  limitations: string[];
  djReviewRequired: true;
}

export interface MashupPlanningSummary {
  trackA: TrackPlanningSnapshot;
  trackB: TrackPlanningSnapshot;
  tempo: TempoCompatibilityPlan;
  harmonic: HarmonicCompatibilityPlan;
  phraseReadinessA: string;
  phraseReadinessB: string;
  limitations: string[];
  djReviewRequired: true;
}

export interface TrackPlanningSnapshot {
  label: string;
  bpm: number | null;
  bpmSource: PlanningValueSource;
  keyLabel: string;
  keySource: PlanningValueSource;
  camelot: string | null;
  camelotSource: PlanningValueSource;
  keyConfidence: number | null;
  beatCount: number | null;
}

const SAFE_PITCH_SHIFT_SEMITONES = 4;
const WARN_PITCH_SHIFT_SEMITONES = 6;

const KEY_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function keyProfileFromAnalysis(key: KeyAnalysisResult | null, jobComplete: boolean): KeyProfile {
  if (!key || !jobComplete) {
    return { key: null, mode: "unknown", camelot: null, confidence: null, method: null };
  }

  return {
    key: key.key,
    mode: key.mode,
    camelot: key.camelot,
    confidence: key.confidence,
    method: key.method,
  };
}

export function buildEffectiveKeyProfile(
  key: KeyAnalysisResult | null,
  overrides: TrackDjOverrides
): EffectiveKeyProfile {
  const detected = keyProfileFromAnalysis(key, Boolean(key));
  const hasKeyOverride = overrides.key !== null || overrides.mode !== null;
  const hasCamelotOverride = overrides.camelot !== null;

  const effectiveKey = overrides.key ?? detected.key;
  const effectiveMode = overrides.mode ?? detected.mode;
  const effectiveCamelot = overrides.camelot ?? detected.camelot;

  return {
    key: effectiveKey,
    mode: effectiveMode,
    camelot: effectiveCamelot,
    confidence: hasKeyOverride || hasCamelotOverride ? null : detected.confidence,
    method: hasKeyOverride || hasCamelotOverride ? "dj_override" : detected.method,
    keySource: hasKeyOverride ? "user_override" : detected.key ? "detected" : "unavailable",
    camelotSource: hasCamelotOverride ? "user_override" : detected.camelot ? "detected" : "unavailable",
    isUserSupplied: hasKeyOverride || hasCamelotOverride,
  };
}

export function effectiveKeyToProfile(profile: EffectiveKeyProfile): KeyProfile {
  return {
    key: profile.key,
    mode: profile.mode,
    camelot: profile.camelot,
    confidence: profile.confidence,
    method: profile.method,
  };
}

export function planTempoCompatibility(
  trackABpm: number | null,
  trackBBpm: number | null
): TempoCompatibilityPlan {
  if (trackABpm === null || trackBBpm === null) {
    return {
      trackABpm,
      trackBBpm,
      bpmDifference: null,
      adjustmentPlan: "Tempo planning unavailable until BPM exists for both tracks.",
      limitations: ["No tempo processing is applied in this phase. Planning only."],
      djReviewRequired: true,
    };
  }

  const bpmDifference = roundOneDecimal(Math.abs(trackABpm - trackBBpm));
  let adjustmentPlan = "";

  if (bpmDifference <= 1) {
    adjustmentPlan = "BPM values are close. A small manual tempo nudge may be enough once processing exists.";
  } else if (bpmDifference <= 4) {
    adjustmentPlan = `Consider aligning Track B toward Track A (${trackABpm} BPM) with a ${bpmDifference.toFixed(1)} BPM adjustment plan. Processing not implemented yet.`;
  } else {
    adjustmentPlan = `Large BPM gap (${bpmDifference.toFixed(1)}). Manual tempo warping review is required before any mashup render.`;
  }

  return {
    trackABpm,
    trackBBpm,
    bpmDifference,
    adjustmentPlan,
    limitations: [
      "Tempo adjustment is planning only. No pitch/time processing is applied in this phase.",
      "Double/half tempo ambiguity from beat detection is not resolved here.",
    ],
    djReviewRequired: true,
  };
}

export function planHarmonicCompatibility(
  trackA: KeyProfile,
  trackB: KeyProfile
): HarmonicCompatibilityPlan {
  const experimentalKeyWarning = buildExperimentalKeyWarning(trackA, trackB);

  if (!trackA.key || !trackB.key || !trackA.camelot || !trackB.camelot) {
    return {
      label: "unknown",
      reason: "Key or Camelot data is missing for one or both tracks.",
      suggestedVocalShiftSemitones: null,
      suggestedInstrumentalShiftSemitones: null,
      pitchShiftWarning: null,
      limitations: ["Harmonic planning requires experimental key estimates for both tracks."],
      djReviewRequired: true,
      experimentalKeyWarning,
    };
  }

  const label = classifyCamelotCompatibility(trackA.camelot, trackB.camelot);
  const instrumentalShift = suggestInstrumentalShiftSemitones(trackA, trackB);
  const vocalShift = suggestVocalShiftSemitones(trackA, trackB, instrumentalShift);
  const pitchShiftWarning = buildPitchShiftWarning(instrumentalShift, vocalShift);

  return {
    label,
    reason: compatibilityReason(label, trackA, trackB),
    suggestedVocalShiftSemitones: vocalShift,
    suggestedInstrumentalShiftSemitones: instrumentalShift,
    pitchShiftWarning,
    limitations: [
      "Key estimates are experimental prototype output, not pro-grade detection.",
      "Pitch-shift values are planning suggestions only. No audio processing is applied.",
      "DJ review required before arranging or exporting.",
    ],
    djReviewRequired: true,
    experimentalKeyWarning,
  };
}

export function buildMashupPlanningSummary(params: {
  trackALabel: string;
  trackBLabel: string;
  trackABpm: number | null;
  trackBBpm: number | null;
  trackABpmSource?: PlanningValueSource;
  trackBBpmSource?: PlanningValueSource;
  trackAKey: KeyProfile | EffectiveKeyProfile;
  trackBKey: KeyProfile | EffectiveKeyProfile;
  phraseReadinessA: string;
  phraseReadinessB: string;
}): MashupPlanningSummary {
  const trackAKey = normalizeEffectiveKey(params.trackAKey);
  const trackBKey = normalizeEffectiveKey(params.trackBKey);
  const tempo = planTempoCompatibility(params.trackABpm, params.trackBBpm);
  const harmonic = planHarmonicCompatibility(effectiveKeyToProfile(trackAKey), effectiveKeyToProfile(trackBKey));

  return {
    trackA: {
      label: params.trackALabel,
      bpm: params.trackABpm,
      bpmSource: params.trackABpmSource ?? "unavailable",
      keyLabel: formatKeyLabel(trackAKey),
      keySource: trackAKey.keySource,
      camelot: trackAKey.camelot,
      camelotSource: trackAKey.camelotSource,
      keyConfidence: trackAKey.confidence,
      beatCount: null,
    },
    trackB: {
      label: params.trackBLabel,
      bpm: params.trackBBpm,
      bpmSource: params.trackBBpmSource ?? "unavailable",
      keyLabel: formatKeyLabel(trackBKey),
      keySource: trackBKey.keySource,
      camelot: trackBKey.camelot,
      camelotSource: trackBKey.camelotSource,
      keyConfidence: trackBKey.confidence,
      beatCount: null,
    },
    tempo,
    harmonic,
    phraseReadinessA: params.phraseReadinessA,
    phraseReadinessB: params.phraseReadinessB,
    limitations: [...tempo.limitations, ...harmonic.limitations],
    djReviewRequired: true,
  };
}

export function parseCamelot(code: string | null): { number: number; mode: "A" | "B" } | null {
  if (!code || code.length < 2) {
    return null;
  }

  const mode = code.slice(-1).toUpperCase();
  const number = Number.parseInt(code.slice(0, -1), 10);

  if ((mode !== "A" && mode !== "B") || !Number.isFinite(number) || number < 1 || number > 12) {
    return null;
  }

  return { number, mode: mode as "A" | "B" };
}

export function classifyCamelotCompatibility(a: string, b: string): CompatibilityLabel {
  const parsedA = parseCamelot(a);
  const parsedB = parseCamelot(b);

  if (!parsedA || !parsedB) {
    return "unknown";
  }

  if (a.toUpperCase() === b.toUpperCase()) {
    return "strong";
  }

  if (parsedA.number === parsedB.number && parsedA.mode !== parsedB.mode) {
    return "compatible";
  }

  const delta = camelotNumberDistance(parsedA.number, parsedB.number);
  if (delta === 1 && parsedA.mode === parsedB.mode) {
    return "compatible";
  }

  return "risky";
}

export function suggestInstrumentalShiftSemitones(trackA: KeyProfile, trackB: KeyProfile): number | null {
  const semitoneA = keyToSemitone(trackA.key, trackA.mode);
  const semitoneB = keyToSemitone(trackB.key, trackB.mode);

  if (semitoneA === null || semitoneB === null) {
    return null;
  }

  return shortestSignedSemitoneDelta(semitoneB, semitoneA);
}

export function suggestVocalShiftSemitones(
  trackA: KeyProfile,
  trackB: KeyProfile,
  instrumentalShift: number | null
): number | null {
  if (instrumentalShift === null) {
    return null;
  }

  const compatibility = classifyCamelotCompatibility(trackA.camelot ?? "", trackB.camelot ?? "");
  if (compatibility === "strong") {
    return 0;
  }

  return clampSemitones(-instrumentalShift);
}

export function formatKeyLabel(profile: KeyProfile): string {
  if (!profile.key) {
    return "Unknown";
  }

  if (profile.mode === "unknown") {
    return profile.key;
  }

  return `${profile.key} ${profile.mode}`;
}

export function formatPlanningPanelLines(summary: MashupPlanningSummary): string[] {
  return [
    `${summary.trackA.label}: ${summary.trackA.bpm ?? "Unknown"} BPM · ${summary.trackA.keyLabel} · ${summary.trackA.camelot ?? "—"}`,
    `${summary.trackB.label}: ${summary.trackB.bpm ?? "Unknown"} BPM · ${summary.trackB.keyLabel} · ${summary.trackB.camelot ?? "—"}`,
    `Tempo gap: ${summary.tempo.bpmDifference ?? "Unknown"} BPM`,
    `Harmonic fit: ${summary.harmonic.label}`,
  ];
}

function compatibilityReason(
  label: CompatibilityLabel,
  trackA: KeyProfile,
  trackB: KeyProfile
): string {
  switch (label) {
    case "strong":
      return `${trackA.camelot} and ${trackB.camelot} match on the Camelot wheel.`;
    case "compatible":
      return `${trackA.camelot} and ${trackB.camelot} are adjacent or relative-key compatible on the Camelot wheel.`;
    case "risky":
      return `${trackA.camelot} and ${trackB.camelot} are not a straightforward Camelot match. Manual harmonic review is recommended.`;
    default:
      return "Harmonic compatibility could not be determined.";
  }
}

function buildExperimentalKeyWarning(trackA: KeyProfile, trackB: KeyProfile): string | null {
  const lowConfidence =
    isUncertainKey(trackA) ||
    isUncertainKey(trackB);

  if (!lowConfidence) {
    return null;
  }

  return "One or both key estimates are low-confidence experimental results. Treat harmonic planning as advisory only.";
}

function isUncertainKey(profile: KeyProfile): boolean {
  return profile.confidence === null || profile.confidence < 0.55 || !profile.key;
}

function buildPitchShiftWarning(
  instrumentalShift: number | null,
  vocalShift: number | null
): string | null {
  const values = [instrumentalShift, vocalShift].filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }

  const maxAbs = Math.max(...values.map((value) => Math.abs(value)));
  if (maxAbs > WARN_PITCH_SHIFT_SEMITONES) {
    return `Suggested pitch shift exceeds ${WARN_PITCH_SHIFT_SEMITONES} semitones. Expect audible artifacts if applied later.`;
  }

  if (maxAbs > SAFE_PITCH_SHIFT_SEMITONES) {
    return `Suggested pitch shift is outside the ${SAFE_PITCH_SHIFT_SEMITONES}-semitone comfort zone. DJ review required.`;
  }

  return null;
}

function keyToSemitone(key: string | null, mode: KeyProfile["mode"]): number | null {
  if (!key) {
    return null;
  }

  const normalized = key.trim();
  const semitone = KEY_SEMITONE[normalized] ?? KEY_SEMITONE[normalized.replace("b", "b").replace("♯", "#")];
  if (semitone === undefined) {
    return null;
  }

  return mode === "minor" ? semitone : semitone;
}

function shortestSignedSemitoneDelta(from: number, to: number): number {
  let delta = ((to - from + 12) % 12);
  if (delta > 6) {
    delta -= 12;
  }
  return delta;
}

function camelotNumberDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 12 - raw);
}

function clampSemitones(value: number): number {
  if (value > 6) {
    return value - 12;
  }
  if (value < -6) {
    return value + 12;
  }
  return value;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeEffectiveKey(profile: KeyProfile | EffectiveKeyProfile): EffectiveKeyProfile {
  if ("keySource" in profile) {
    return profile;
  }

  return {
    ...profile,
    keySource: profile.key ? "detected" : "unavailable",
    camelotSource: profile.camelot ? "detected" : "unavailable",
    isUserSupplied: false,
  };
}
