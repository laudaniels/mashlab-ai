import { AlertTriangle, Gauge, Music2, RotateCcw, Target, TimerReset } from "lucide-react";
import {
  buildPitchTimePlanFromArtifacts,
  formatPitchShiftSummary,
  intentLabel,
  rubberBandReadinessFromCapabilityStatus,
  type MashIntent,
  type RubberBandReadiness,
  PLANNING_ONLY_NOTICE,
} from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import { formatPlanningSource, parseBpmOverride } from "../domain/trackOverrides.ts";
import { rubberBandCapabilitySummary } from "../lib/localEngine/capabilities.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import type { TrackState } from "../domain/types.ts";
import { PitchTimePreviewSection } from "./PitchTimePreviewSection.tsx";

interface PitchTimePlanPanelProps {
  artifactStore: SessionArtifactStore;
  intent: MashIntent;
  onIntentChange: (intent: MashIntent) => void;
  tracks: TrackState[];
  customTargetBpm: number | null;
  onCustomTargetBpmChange: (value: number | null) => void;
}

const INTENT_OPTIONS: Array<{ id: MashIntent; label: string }> = [
  { id: "vocal_a_over_beat_b", label: "Vocal A over Beat B" },
  { id: "vocal_b_over_beat_a", label: "Vocal B over Beat A" },
  { id: "compare_both", label: "Compare both directions" },
];

export function PitchTimePlanPanel({
  artifactStore,
  intent,
  onIntentChange,
  tracks,
  customTargetBpm,
  onCustomTargetBpmChange,
}: PitchTimePlanPanelProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const rubberBand = rubberBandCapabilitySummary(localStatus.capabilities);
  const rubberBandStatus = rubberBandReadinessFromCapabilityStatus(rubberBand.status);
  const rubberBandMessage = rubberBand.message;

  const plan = buildPitchTimePlanFromArtifacts({
    artifactStore,
    intent,
    customTargetBpm,
    rubberBandStatus,
    rubberBandMessage,
  });

  if (!plan) {
    return (
      <section className="pitch-time-panel pitch-time-panel-empty">
        <div className="pitch-time-panel-header">
          <TimerReset aria-hidden="true" size={20} />
          <div>
            <h3>Pitch / Time Plan</h3>
            <p>Load and analyze both tracks to generate a tempo and key processing strategy.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pitch-time-panel" aria-label="Pitch and time planning">
      <div className="pitch-time-panel-header">
        <TimerReset aria-hidden="true" size={20} />
        <div>
          <h3>Pitch / Time Plan</h3>
          <p>{PLANNING_ONLY_NOTICE}</p>
        </div>
        <span className={`planning-badge planning-badge-${rubberBandBadgeClass(plan.rubberBandStatus)}`}>
          Rubber Band: {plan.rubberBandStatus}
        </span>
      </div>

      <div className="pitch-time-intent-row">
        <label className="pitch-time-intent-label" htmlFor="mash-intent">
          <Music2 aria-hidden="true" size={16} />
          Mash intent
        </label>
        <select
          id="mash-intent"
          onChange={(event) => onIntentChange(event.currentTarget.value as MashIntent)}
          value={intent}
        >
          {INTENT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pitch-time-intent-note">{intentLabel(intent)} · use stem preview for vocal/instrumental split</span>
      </div>

      <div className="pitch-time-target-bpm-row">
        <label className="pitch-time-intent-label" htmlFor="custom-target-bpm">
          <Target aria-hidden="true" size={16} />
          Custom target BPM
        </label>
        <input
          id="custom-target-bpm"
          inputMode="decimal"
          onChange={(event) => {
            const raw = event.currentTarget.value;
            onCustomTargetBpmChange(raw.trim() ? parseBpmOverride(raw) : null);
          }}
          placeholder="e.g. 124 (optional)"
          type="text"
          value={customTargetBpm !== null ? String(customTargetBpm) : ""}
        />
        {customTargetBpm !== null ? (
          <button
            className="ghost-button"
            onClick={() => onCustomTargetBpmChange(null)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            Clear
          </button>
        ) : null}
        <span className="pitch-time-intent-note">
          {customTargetBpm !== null
            ? `Both tracks stretch toward ${customTargetBpm} BPM instead of locking to the instrumental. DJ review required.`
            : "Optional — leave blank to lock the target tempo to the instrumental's BPM (default)."}
        </span>
      </div>

      <p className="pitch-time-rubberband-note">{plan.rubberBandMessage}</p>

      <div className="pitch-time-direction-grid">
        {plan.directions.map((direction) => (
          <article className="pitch-time-direction-card" key={direction.intentLabel}>
            <h4>{direction.intentLabel}</h4>

            <div className="planning-detail-grid">
              <div className="planning-detail-card">
                <div className="planning-detail-header">
                  <TimerReset aria-hidden="true" size={18} />
                  <strong>Tempo plan</strong>
                </div>
                <p className="planning-detail-value">{direction.tempoPlanSummary}</p>
                <p className="planning-detail-note">
                  Vocal ratio {direction.tempoStretchRatio ?? "—"} · Instrumental ratio{" "}
                  {direction.instrumentalTempoStretchRatio ?? "—"} · BPM source:{" "}
                  {formatPlanningSource(direction.bpmSource)}
                </p>
              </div>

              <div className="planning-detail-card">
                <div className="planning-detail-header">
                  <Gauge aria-hidden="true" size={18} />
                  <strong>Key plan</strong>
                </div>
                <p className="planning-detail-value">
                  {formatPitchShiftSummary(direction.suggestedPitchShiftSemitones)}
                </p>
                <p className="planning-detail-note">
                  {direction.sourceKeyLabel} → {direction.targetKeyLabel} · Key source:{" "}
                  {formatPlanningSource(direction.keySource)}
                </p>
              </div>
            </div>

            <div className="pitch-time-notes">
              <p>{direction.vocalAdjustmentNote}</p>
              <p>{direction.instrumentalAdjustmentNote}</p>
              <p>{direction.formantPreservationNote}</p>
            </div>

            {direction.safeRangeWarning ? (
              <div className="planning-warning">
                <AlertTriangle aria-hidden="true" size={18} />
                <span>{direction.safeRangeWarning}</span>
              </div>
            ) : null}

            {direction.tempoRatioWarning ? (
              <div className="planning-warning">
                <AlertTriangle aria-hidden="true" size={18} />
                <span>{direction.tempoRatioWarning}</span>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <PitchTimePreviewSection
        artifactStore={artifactStore}
        intent={intent}
        localStatus={localStatus}
        plan={plan}
        rubberBandStatus={rubberBandStatus}
        tracks={tracks}
      />

      <p className="planning-review-note">
        DJ review required. Preview processing is user-initiated and does not run automatically.
      </p>
    </section>
  );
}

function rubberBandBadgeClass(status: RubberBandReadiness): string {
  switch (status) {
    case "available":
      return "strong";
    case "missing":
      return "risky";
    case "planned":
      return "compatible";
    default:
      return "unknown";
  }
}
