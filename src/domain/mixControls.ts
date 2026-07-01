export const MIX_CONTROLS_NOTICE =
  "Mix controls apply only when you create a new preview or export. Existing artifacts are not changed.";

export const MIX_DJ_REVIEW_NOTICE = "DJ review required — not professional mastering.";

export const MIX_STEREO_MONO_NOTE =
  "Stereo/mono safety check is display-only in this phase — verify phase compatibility manually.";

export const GAIN_MIN_DB = -24;
export const GAIN_MAX_DB = 12;
export const FADE_MAX_MS = 30_000;

export interface MixSettings {
  vocalGainDb: number;
  instrumentalGainDb: number;
  masterGainDb: number;
  vocalFadeInMs: number;
  vocalFadeOutMs: number;
  instrumentalFadeInMs: number;
  instrumentalFadeOutMs: number;
  limiterSafety: boolean;
  clippingGuard: boolean;
  /** Light sidechain duck on instrumental bed when vocal is present (Quick Mix default). */
  instrumentalDuckUnderVocal: boolean;
}

export const NEUTRAL_MIX_SETTINGS: MixSettings = {
  vocalGainDb: 0,
  instrumentalGainDb: 0,
  masterGainDb: 0,
  vocalFadeInMs: 0,
  vocalFadeOutMs: 0,
  instrumentalFadeInMs: 0,
  instrumentalFadeOutMs: 0,
  limiterSafety: false,
  clippingGuard: false,
  instrumentalDuckUnderVocal: false,
};

export function createNeutralMixSettings(): MixSettings {
  return { ...NEUTRAL_MIX_SETTINGS };
}

export function validateMixSettings(settings: MixSettings): string[] {
  const errors: string[] = [];

  for (const [label, value] of [
    ["Vocal gain", settings.vocalGainDb],
    ["Instrumental gain", settings.instrumentalGainDb],
    ["Master trim", settings.masterGainDb],
  ] as const) {
    if (value < GAIN_MIN_DB || value > GAIN_MAX_DB) {
      errors.push(`${label} must be between ${GAIN_MIN_DB} and ${GAIN_MAX_DB} dB.`);
    }
  }

  for (const [label, value] of [
    ["Vocal fade in", settings.vocalFadeInMs],
    ["Vocal fade out", settings.vocalFadeOutMs],
    ["Instrumental fade in", settings.instrumentalFadeInMs],
    ["Instrumental fade out", settings.instrumentalFadeOutMs],
  ] as const) {
    if (value < 0 || value > FADE_MAX_MS) {
      errors.push(`${label} must be between 0 and ${FADE_MAX_MS} ms.`);
    }
  }

  return errors;
}

export function formatGainDb(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

export function formatFadeMs(value: number): string {
  if (value <= 0) {
    return "0 ms";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }
  return `${Math.round(value)} ms`;
}

export function formatMixSettingsSummary(settings: MixSettings): string {
  const parts = [
    `vocal ${formatGainDb(settings.vocalGainDb)}`,
    `bed ${formatGainDb(settings.instrumentalGainDb)}`,
    `master ${formatGainDb(settings.masterGainDb)}`,
  ];
  if (settings.limiterSafety) {
    parts.push("limiter on");
  }
  if (settings.clippingGuard) {
    parts.push("clip guard on");
  }
  if (settings.instrumentalDuckUnderVocal) {
    parts.push("bed duck on");
  }
  return parts.join(" · ");
}

export function mixSettingsToRequestFields(settings: MixSettings): Record<string, number | boolean> {
  return {
    vocal_gain_db: settings.vocalGainDb,
    instrumental_gain_db: settings.instrumentalGainDb,
    master_gain_db: settings.masterGainDb,
    vocal_fade_in_ms: settings.vocalFadeInMs,
    vocal_fade_out_ms: settings.vocalFadeOutMs,
    instrumental_fade_in_ms: settings.instrumentalFadeInMs,
    instrumental_fade_out_ms: settings.instrumentalFadeOutMs,
    limiter_safety: settings.limiterSafety,
    clipping_guard: settings.clippingGuard,
    instrumental_duck_under_vocal: settings.instrumentalDuckUnderVocal,
  };
}

export function parseMixSettings(value: unknown): MixSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    vocalGainDb: parseNumber(record.vocal_gain_db, 0),
    instrumentalGainDb: parseNumber(record.instrumental_gain_db, 0),
    masterGainDb: parseNumber(record.master_gain_db, 0),
    vocalFadeInMs: parseNumber(record.vocal_fade_in_ms, 0),
    vocalFadeOutMs: parseNumber(record.vocal_fade_out_ms, 0),
    instrumentalFadeInMs: parseNumber(record.instrumental_fade_in_ms, 0),
    instrumentalFadeOutMs: parseNumber(record.instrumental_fade_out_ms, 0),
    limiterSafety: record.limiter_safety === true,
    clippingGuard: record.clipping_guard === true,
    instrumentalDuckUnderVocal: record.instrumental_duck_under_vocal === true,
  };
}

export function isNeutralMixSettings(settings: MixSettings): boolean {
  return (
    settings.vocalGainDb === 0 &&
    settings.instrumentalGainDb === 0 &&
    settings.masterGainDb === 0 &&
    settings.vocalFadeInMs === 0 &&
    settings.vocalFadeOutMs === 0 &&
    settings.instrumentalFadeInMs === 0 &&
    settings.instrumentalFadeOutMs === 0 &&
    !settings.limiterSafety &&
    !settings.clippingGuard &&
    !settings.instrumentalDuckUnderVocal
  );
}

export function formatLoudnessWarnings(warnings: string[]): string[] {
  return warnings.filter(
    (line) =>
      /lufs|true peak|clipping|not_available|peak/i.test(line) ||
      /limiter|clip guard/i.test(line)
  );
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}
