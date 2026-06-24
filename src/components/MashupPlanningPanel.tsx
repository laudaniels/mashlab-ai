import { AlertTriangle, Gauge, KeyRound, Scale, TimerReset } from "lucide-react";
import { buildPairPlanningSummary } from "../domain/mashupPlanning.ts";
import type { MashTrackJob } from "../domain/jobs.ts";
import type { CompatibilityLabel } from "../domain/harmonicPlanning.ts";

interface MashupPlanningPanelProps {
  trackAJob: MashTrackJob | null;
  trackBJob: MashTrackJob | null;
}

export function MashupPlanningPanel({ trackAJob, trackBJob }: MashupPlanningPanelProps) {
  const summary = buildPairPlanningSummary({
    trackALabel: "Track A",
    trackBLabel: "Track B",
    trackAJob: trackAJob,
    trackBJob: trackBJob,
  });

  if (!summary) {
    return (
      <section className="planning-panel planning-panel-empty">
        <div className="planning-panel-header">
          <Scale aria-hidden="true" size={20} />
          <div>
            <h3>Mashup Planning</h3>
            <p>Load and analyze both tracks to compare tempo, key, and phrase readiness.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="planning-panel" aria-label="Mashup planning summary">
      <div className="planning-panel-header">
        <Scale aria-hidden="true" size={20} />
        <div>
          <h3>Mashup Planning</h3>
          <p>Planning only. No pitch/time processing or export is applied in this phase.</p>
        </div>
        <span className={`planning-badge planning-badge-${summary.harmonic.label}`}>
          {summary.harmonic.label}
        </span>
      </div>

      <div className="planning-track-grid">
        <PlanningTrackCard
          beatCount={summary.trackA.beatCount}
          bpm={summary.trackA.bpm}
          camelot={summary.trackA.camelot}
          confidence={summary.trackA.keyConfidence}
          keyLabel={summary.trackA.keyLabel}
          label={summary.trackA.label}
          phraseReadiness={summary.phraseReadinessA}
        />
        <PlanningTrackCard
          beatCount={summary.trackB.beatCount}
          bpm={summary.trackB.bpm}
          camelot={summary.trackB.camelot}
          confidence={summary.trackB.keyConfidence}
          keyLabel={summary.trackB.keyLabel}
          label={summary.trackB.label}
          phraseReadiness={summary.phraseReadinessB}
        />
      </div>

      <div className="planning-detail-grid">
        <PlanningDetail
          icon={TimerReset}
          label="Tempo plan"
          value={
            summary.tempo.bpmDifference !== null
              ? `${summary.tempo.bpmDifference} BPM gap`
              : "Unavailable"
          }
          note={summary.tempo.adjustmentPlan}
        />
        <PlanningDetail
          icon={KeyRound}
          label="Harmonic fit"
          value={summary.harmonic.label}
          note={summary.harmonic.reason}
        />
        <PlanningDetail
          icon={Gauge}
          label="Pitch-shift planning"
          value={formatShift(summary.harmonic.suggestedInstrumentalShiftSemitones, "instrumental")}
          note={formatShift(summary.harmonic.suggestedVocalShiftSemitones, "vocal")}
        />
        <PlanningDetail
          icon={Scale}
          label="Phrase readiness"
          value="Heuristic review"
          note={`${summary.trackA.label}: ${summary.phraseReadinessA}. ${summary.trackB.label}: ${summary.phraseReadinessB}.`}
        />
      </div>

      {summary.harmonic.experimentalKeyWarning ? (
        <div className="planning-warning">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>{summary.harmonic.experimentalKeyWarning}</span>
        </div>
      ) : null}

      {summary.harmonic.pitchShiftWarning ? (
        <div className="planning-warning">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>{summary.harmonic.pitchShiftWarning}</span>
        </div>
      ) : null}

      <p className="planning-review-note">
        DJ review required. Phrase windows are heuristic unless true downbeat detection is added later.
      </p>
    </section>
  );
}

function PlanningTrackCard(props: {
  label: string;
  bpm: number | null;
  keyLabel: string;
  camelot: string | null;
  confidence: number | null;
  beatCount: number | null;
  phraseReadiness: string;
}) {
  return (
    <article className="planning-track-card">
      <h4>{props.label}</h4>
      <div className="planning-metric">
        <span>BPM</span>
        <strong>{props.bpm ?? "Unknown"}</strong>
      </div>
      <div className="planning-metric">
        <span>Key</span>
        <strong>{props.keyLabel}</strong>
      </div>
      <div className="planning-metric">
        <span>Camelot</span>
        <strong>{props.camelot ?? "Unknown"}</strong>
      </div>
      <div className="planning-metric">
        <span>Beats detected</span>
        <strong>{props.beatCount ?? "Unknown"}</strong>
      </div>
      {props.confidence !== null ? (
        <div className="planning-metric">
          <span>Key confidence</span>
          <strong>{(props.confidence * 100).toFixed(0)}%</strong>
        </div>
      ) : null}
      <p className="planning-track-note">{props.phraseReadiness}</p>
    </article>
  );
}

function PlanningDetail(props: {
  icon: typeof Gauge;
  label: string;
  value: string;
  note: string;
}) {
  const Icon = props.icon;

  return (
    <article className="planning-detail-card">
      <div className="planning-detail-header">
        <Icon aria-hidden="true" size={18} />
        <strong>{props.label}</strong>
      </div>
      <p className="planning-detail-value">{props.value}</p>
      <p className="planning-detail-note">{props.note}</p>
    </article>
  );
}

function formatShift(semitones: number | null, role: "instrumental" | "vocal"): string {
  if (semitones === null) {
    return `${role}: unavailable`;
  }

  if (semitones === 0) {
    return `${role}: 0 semitones suggested`;
  }

  const direction = semitones > 0 ? "+" : "";
  return `${role}: ${direction}${semitones} semitones suggested`;
}

export function compatibilityLabelClass(label: CompatibilityLabel): string {
  return `planning-badge-${label}`;
}
