import {
  createNeutralMixSettings,
  parseMixSettings,
  type MixSettings,
} from "../domain/mixControls.ts";

const STORAGE_KEY = "mashlab-mix-settings-v1";

export function loadMixSettings(): MixSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return createNeutralMixSettings();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createNeutralMixSettings();
    }
    const parsed = parseMixSettings(JSON.parse(raw));
    return parsed ?? createNeutralMixSettings();
  } catch {
    return createNeutralMixSettings();
  }
}

export function saveMixSettings(settings: MixSettings): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        vocal_gain_db: settings.vocalGainDb,
        instrumental_gain_db: settings.instrumentalGainDb,
        master_gain_db: settings.masterGainDb,
        vocal_fade_in_ms: settings.vocalFadeInMs,
        vocal_fade_out_ms: settings.vocalFadeOutMs,
        instrumental_fade_in_ms: settings.instrumentalFadeInMs,
        instrumental_fade_out_ms: settings.instrumentalFadeOutMs,
        limiter_safety: settings.limiterSafety,
        clipping_guard: settings.clippingGuard,
      })
    );
  } catch {
    // Ignore quota failures.
  }
}

export function resetMixSettings(): MixSettings {
  const neutral = createNeutralMixSettings();
  saveMixSettings(neutral);
  return neutral;
}
