import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import {
  MIX_CONTROLS_NOTICE,
  MIX_DJ_REVIEW_NOTICE,
  MIX_STEREO_MONO_NOTE,
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  FADE_MAX_MS,
  createNeutralMixSettings,
  formatFadeMs,
  formatGainDb,
  validateMixSettings,
  type MixSettings,
} from "../domain/mixControls.ts";
import { saveMixSettings } from "../lib/mixSession.ts";

interface MixControlsPanelProps {
  settings: MixSettings;
  onChange: (settings: MixSettings) => void;
  disabled?: boolean;
}

export function MixControlsPanel({ settings, onChange, disabled = false }: MixControlsPanelProps) {
  const validationErrors = validateMixSettings(settings);

  function update<K extends keyof MixSettings>(key: K, value: MixSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function handleReset() {
    onChange(createNeutralMixSettings());
  }

  function handleSavePreference() {
    if (validationErrors.length > 0) {
      return;
    }
    saveMixSettings(settings);
  }

  return (
    <section className="mix-controls-panel" aria-label="Mix controls">
      <div className="mix-controls-header">
        <SlidersHorizontal aria-hidden="true" size={18} />
        <div>
          <h4>Mix controls</h4>
          <p>{MIX_CONTROLS_NOTICE}</p>
        </div>
      </div>

      <p className="mix-controls-review">{MIX_DJ_REVIEW_NOTICE}</p>
      <p className="mix-controls-note">{MIX_STEREO_MONO_NOTE}</p>

      <div className="mix-controls-grid">
        <label className="mix-controls-field">
          <span>Vocal level ({formatGainDb(settings.vocalGainDb)})</span>
          <input
            disabled={disabled}
            max={GAIN_MAX_DB}
            min={GAIN_MIN_DB}
            onChange={(event) => update("vocalGainDb", Number(event.target.value))}
            step={0.5}
            type="range"
            value={settings.vocalGainDb}
          />
        </label>
        <label className="mix-controls-field">
          <span>Instrumental bed ({formatGainDb(settings.instrumentalGainDb)})</span>
          <input
            disabled={disabled}
            max={GAIN_MAX_DB}
            min={GAIN_MIN_DB}
            onChange={(event) => update("instrumentalGainDb", Number(event.target.value))}
            step={0.5}
            type="range"
            value={settings.instrumentalGainDb}
          />
        </label>
        <label className="mix-controls-field">
          <span>Master trim ({formatGainDb(settings.masterGainDb)})</span>
          <input
            disabled={disabled}
            max={GAIN_MAX_DB}
            min={GAIN_MIN_DB}
            onChange={(event) => update("masterGainDb", Number(event.target.value))}
            step={0.5}
            type="range"
            value={settings.masterGainDb}
          />
        </label>
        <label className="mix-controls-field">
          <span>Vocal fade in ({formatFadeMs(settings.vocalFadeInMs)})</span>
          <input
            disabled={disabled}
            max={FADE_MAX_MS}
            min={0}
            onChange={(event) => update("vocalFadeInMs", Number(event.target.value))}
            step={100}
            type="range"
            value={settings.vocalFadeInMs}
          />
        </label>
        <label className="mix-controls-field">
          <span>Vocal fade out ({formatFadeMs(settings.vocalFadeOutMs)})</span>
          <input
            disabled={disabled}
            max={FADE_MAX_MS}
            min={0}
            onChange={(event) => update("vocalFadeOutMs", Number(event.target.value))}
            step={100}
            type="range"
            value={settings.vocalFadeOutMs}
          />
        </label>
        <label className="mix-controls-field">
          <span>Bed fade in ({formatFadeMs(settings.instrumentalFadeInMs)})</span>
          <input
            disabled={disabled}
            max={FADE_MAX_MS}
            min={0}
            onChange={(event) => update("instrumentalFadeInMs", Number(event.target.value))}
            step={100}
            type="range"
            value={settings.instrumentalFadeInMs}
          />
        </label>
        <label className="mix-controls-field">
          <span>Bed fade out ({formatFadeMs(settings.instrumentalFadeOutMs)})</span>
          <input
            disabled={disabled}
            max={FADE_MAX_MS}
            min={0}
            onChange={(event) => update("instrumentalFadeOutMs", Number(event.target.value))}
            step={100}
            type="range"
            value={settings.instrumentalFadeOutMs}
          />
        </label>
      </div>

      <div className="mix-controls-toggles">
        <label className="mix-controls-checkbox">
          <input
            checked={settings.limiterSafety}
            disabled={disabled}
            onChange={(event) => update("limiterSafety", event.target.checked)}
            type="checkbox"
          />
          <span>Limiter safety (conservative FFmpeg prototype)</span>
        </label>
        <label className="mix-controls-checkbox">
          <input
            checked={settings.clippingGuard}
            disabled={disabled}
            onChange={(event) => update("clippingGuard", event.target.checked)}
            type="checkbox"
          />
          <span>Clipping guard (~-1 dBTP ceiling prototype)</span>
        </label>
      </div>

      <div className="mix-controls-actions">
        <button disabled={disabled} onClick={handleReset} type="button">
          <RotateCcw aria-hidden="true" size={14} />
          Reset to neutral
        </button>
        <button
          disabled={disabled || validationErrors.length > 0}
          onClick={handleSavePreference}
          type="button"
        >
          <Save aria-hidden="true" size={14} />
          Save as session preference
        </button>
      </div>

      {validationErrors.length > 0 ? (
        <ul className="mix-controls-errors">
          {validationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
