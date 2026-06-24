import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { TrackSessionArtifact } from "../domain/sessionArtifacts.ts";
import {
  PHRASE_LENGTH_OPTIONS,
  formatPlanningSource,
  type PhraseLengthBars,
  type TrackDjOverrides,
} from "../domain/trackOverrides.ts";
import type { SlotId } from "../domain/types.ts";

interface TrackOverridePanelProps {
  slotId: SlotId;
  label: string;
  artifact: TrackSessionArtifact | null;
  onChange: (patch: Partial<TrackDjOverrides>) => void;
  onClear: () => void;
}

export function TrackOverridePanel({
  slotId,
  label,
  artifact,
  onChange,
  onClear,
}: TrackOverridePanelProps) {
  const overrides = artifact?.overrides;
  const detectedBpm = artifact?.beatAnalysis?.bpm ?? null;
  const detectedKey = artifact?.keyAnalysis?.key ?? null;
  const detectedMode = artifact?.keyAnalysis?.mode ?? "unknown";
  const detectedCamelot = artifact?.keyAnalysis?.camelot ?? null;

  return (
    <section className="override-panel" aria-label={`${label} DJ overrides`}>
      <div className="override-panel-header">
        <SlidersHorizontal aria-hidden="true" size={18} />
        <div>
          <h3>{label} · DJ Override</h3>
          <p>User-supplied values take precedence over experimental analysis. No audio is processed.</p>
        </div>
        <button className="ghost-button" onClick={onClear} type="button">
          <RotateCcw aria-hidden="true" size={16} />
          Reset
        </button>
      </div>

      <div className="override-grid">
        <OverrideField
          detectedValue={detectedBpm !== null ? String(detectedBpm) : undefined}
          hint="Overrides detected BPM for planning."
          id={`${slotId}-bpm`}
          label="BPM"
          onChange={(value) => onChange({ bpm: value ? Number.parseFloat(value) || null : null })}
          placeholder="e.g. 128"
          source={overrides?.bpm !== null && overrides?.bpm !== undefined ? "user_override" : "detected"}
          value={overrides?.bpm !== null && overrides?.bpm !== undefined ? String(overrides.bpm) : ""}
        />
        <OverrideField
          detectedValue={detectedKey ?? undefined}
          hint="Root note for harmonic planning."
          id={`${slotId}-key`}
          label="Key"
          onChange={(value) => onChange({ key: value.trim() || null })}
          placeholder="e.g. Am or C"
          source={overrides?.key ? "user_override" : detectedKey ? "detected" : "unavailable"}
          value={overrides?.key ?? ""}
        />
        <label className="override-field" htmlFor={`${slotId}-mode`}>
          <span>Mode</span>
          <select
            id={`${slotId}-mode`}
            onChange={(event) =>
              onChange({
                mode:
                  event.currentTarget.value === ""
                    ? null
                    : (event.currentTarget.value as TrackDjOverrides["mode"]),
              })
            }
            value={overrides?.mode ?? ""}
          >
            <option value="">Use detected ({detectedMode})</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="unknown">Unknown</option>
          </select>
          <small>{formatPlanningSource(overrides?.mode ? "user_override" : detectedMode !== "unknown" ? "detected" : "unavailable")}</small>
        </label>
        <OverrideField
          detectedValue={detectedCamelot ?? undefined}
          hint="Camelot code for harmonic compatibility."
          id={`${slotId}-camelot`}
          label="Camelot"
          onChange={(value) => onChange({ camelot: value.trim().toUpperCase() || null })}
          placeholder="e.g. 8A"
          source={overrides?.camelot ? "user_override" : detectedCamelot ? "detected" : "unavailable"}
          value={overrides?.camelot ?? ""}
        />
        <OverrideField
          hint="Timestamp (seconds) where beat 1 / bar 1 should anchor."
          id={`${slotId}-alignment`}
          label="First beat offset (s)"
          onChange={(value) =>
            onChange({
              alignmentOffsetSeconds: value.trim() ? Number.parseFloat(value) || null : null,
            })
          }
          placeholder="e.g. 0.5"
          source={overrides?.alignmentOffsetSeconds !== null && overrides?.alignmentOffsetSeconds !== undefined ? "user_override" : "unavailable"}
          value={
            overrides?.alignmentOffsetSeconds !== null && overrides?.alignmentOffsetSeconds !== undefined
              ? String(overrides.alignmentOffsetSeconds)
              : ""
          }
        />
        <label className="override-field" htmlFor={`${slotId}-phrase-length`}>
          <span>Phrase length</span>
          <select
            id={`${slotId}-phrase-length`}
            onChange={(event) =>
              onChange({
                phraseLengthBars:
                  event.currentTarget.value === ""
                    ? null
                    : (Number.parseInt(event.currentTarget.value, 10) as PhraseLengthBars),
              })
            }
            value={overrides?.phraseLengthBars ?? ""}
          >
            <option value="">Default (8 bars)</option>
            {PHRASE_LENGTH_OPTIONS.map((bars) => (
              <option key={bars} value={bars}>
                {bars} bars
              </option>
            ))}
          </select>
          <small>Heuristic phrase windows only · DJ review required</small>
        </label>
      </div>
    </section>
  );
}

function OverrideField(props: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  hint: string;
  detectedValue?: string;
  source: "detected" | "heuristic" | "user_override" | "unavailable";
  onChange: (value: string) => void;
}) {
  return (
    <label className="override-field" htmlFor={props.id}>
      <span>{props.label}</span>
      <input
        id={props.id}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        type="text"
        value={props.value}
      />
      <small>
        {props.detectedValue ? `Detected: ${props.detectedValue} · ` : ""}
        {formatPlanningSource(props.source)}
      </small>
      <small>{props.hint}</small>
    </label>
  );
}
