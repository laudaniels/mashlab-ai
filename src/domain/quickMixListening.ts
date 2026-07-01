import type { MixSettings } from "./mixControls.ts";
import { formatMixSettingsSummary } from "./mixControls.ts";
import type { LoudnessReadout } from "./previewArtifacts.ts";
import { formatLoudnessWarnings } from "./mixControls.ts";
import { evaluateLoudnessGateDisplay } from "./fullLengthExport.ts";

/** RC2 baseline before Phase 39 listening polish (documented for A/B notes). */
export const QUICK_MIX_RC2_BASELINE_MIX_SETTINGS: MixSettings = {
  vocalGainDb: 0,
  instrumentalGainDb: 0,
  masterGainDb: 0,
  vocalFadeInMs: 0,
  vocalFadeOutMs: 0,
  instrumentalFadeInMs: 0,
  instrumentalFadeOutMs: 0,
  limiterSafety: true,
  clippingGuard: true,
  instrumentalDuckUnderVocal: false,
};

export const QUICK_MIX_LISTENING_MIX_NOTICE =
  "Listening-test mix profile: vocal slightly forward, bed tucked, light duck under vocal, conservative limiter + clip guard. DJ review required — not professional mastering.";

export const QUICK_MIX_PROCESSING_PATIENCE_NOTICE =
  "Processing may take several minutes on CPU — especially stem separation. Keep the local engine running; this tab can stay open while MashLab works.";

export function buildQuickMixMixProfileSummary(settings: MixSettings): string {
  const parts = [formatMixSettingsSummary(settings)];
  if (settings.instrumentalDuckUnderVocal) {
    parts.push("light bed duck under vocal");
  }
  return parts.join(" · ");
}

export function buildQuickMixListeningComparisonNotes(
  baseline: MixSettings,
  applied: MixSettings
): string[] {
  return [
    `RC2 baseline: ${formatMixSettingsSummary(baseline)}${baseline.instrumentalDuckUnderVocal ? " · light bed duck" : ""}`,
    `Phase 39 listening profile: ${buildQuickMixMixProfileSummary(applied)}`,
  ];
}

export function buildQuickMixLoudnessNotice(loudness: LoudnessReadout | null): string | null {
  const gate = evaluateLoudnessGateDisplay(loudness);
  if (gate.status === "pass") {
    const lufs =
      gate.integratedLufs !== null ? `${gate.integratedLufs.toFixed(1)} LUFS integrated` : "LUFS not measured";
    const peak =
      gate.truePeakDbtp !== null ? `${gate.truePeakDbtp.toFixed(1)} dBTP true peak` : "true peak not measured";
    return `Loudness readout: ${lufs}, ${peak}. Prototype mix — DJ review required.`;
  }
  if (gate.status === "warn") {
    return gate.message;
  }
  if (gate.status === "not_available") {
    return "Loudness/peaks not measured for this export — listen locally and adjust in Advanced Studio if needed.";
  }
  return gate.message;
}

export function buildQuickMixLoudnessWarnings(
  loudness: LoudnessReadout | null,
  exportWarnings: string[]
): string[] {
  const fromExport = formatLoudnessWarnings(exportWarnings);
  if (fromExport.length > 0) {
    return fromExport;
  }
  if (!loudness) {
    return [];
  }
  const gate = evaluateLoudnessGateDisplay(loudness);
  if (gate.status === "warn") {
    return [gate.message];
  }
  return [];
}

export function formatQuickMixLoudnessTechnicalLine(loudness: LoudnessReadout | null): string | null {
  if (!loudness || loudness.status === "not_available") {
    return "Loudness: not_available";
  }
  const lufs =
    loudness.integratedLufs !== null ? `${loudness.integratedLufs.toFixed(1)} LUFS` : "LUFS n/a";
  const peak =
    loudness.truePeakDbtp !== null
      ? `${loudness.truePeakDbtp.toFixed(1)} dBTP`
      : loudness.peakLevelDb !== null
        ? `${loudness.peakLevelDb.toFixed(1)} dB peak`
        : "peak n/a";
  return `Loudness readout: ${lufs}, ${peak} (${loudness.status})`;
}
