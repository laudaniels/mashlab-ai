import { AlertTriangle, Clock3, Waves } from "lucide-react";
import {
  buildTimelineLaneData,
  formatTimelineSummaryLines,
  timelineDurationSeconds,
  type TimelineLaneData,
} from "../domain/timelineAlignment.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import { formatPlanningSource } from "../domain/trackOverrides.ts";
import type { TrackState } from "../domain/types.ts";

interface TimelineAlignmentPanelProps {
  tracks: TrackState[];
  artifactStore: SessionArtifactStore;
}

export function TimelineAlignmentPanel({ tracks, artifactStore }: TimelineAlignmentPanelProps) {
  const lanes = tracks
    .map((track) => buildTimelineLaneData(track, artifactStore.tracks[track.slotId]))
    .filter((lane): lane is TimelineLaneData => lane !== null);

  if (lanes.length === 0) {
    return (
      <section className="timeline-panel timeline-panel-empty">
        <div className="timeline-panel-header">
          <Clock3 aria-hidden="true" size={20} />
          <div>
            <h3>Timeline Alignment</h3>
            <p>Upload tracks on the Upload screen to preview beat and phrase planning.</p>
          </div>
        </div>
      </section>
    );
  }

  const duration = timelineDurationSeconds(lanes);
  const summaryLines = formatTimelineSummaryLines(lanes);

  return (
    <section className="timeline-panel" aria-label="Timeline alignment preview">
      <div className="timeline-panel-header">
        <Clock3 aria-hidden="true" size={20} />
        <div>
          <h3>Timeline Alignment</h3>
          <p>Read-only planning view. Phrase windows may be heuristic or verified when phrase analysis has run — DJ review always required.</p>
        </div>
      </div>

      <div className="timeline-summary-list">
        {summaryLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div className="timeline-stack">
        {lanes.map((lane) => (
          <TimelineLane key={lane.slotId} duration={duration} lane={lane} />
        ))}
      </div>

      <div className="timeline-legend">
        <span className="timeline-legend-item">
          <span className="timeline-legend-swatch timeline-legend-wave" />
          Waveform preview
        </span>
        <span className="timeline-legend-item">
          <span className="timeline-legend-swatch timeline-legend-beat" />
          Detected beats
        </span>
        <span className="timeline-legend-item">
          <span className="timeline-legend-swatch timeline-legend-phrase" />
          Heuristic or verified phrase window
        </span>
      </div>

      <div className="timeline-note">
        <AlertTriangle aria-hidden="true" size={18} />
        <span>
          Intro / verse / drop structure: not implemented. Phrase/downbeat evidence is planning-only. DJ review required.
        </span>
      </div>
    </section>
  );
}

function TimelineLane(props: { lane: TimelineLaneData; duration: number }) {
  const { lane, duration } = props;
  const safeDuration = Math.max(duration, 1);

  return (
    <article className="timeline-lane-card">
      <div className="timeline-lane-header">
        <Waves aria-hidden="true" size={18} />
        <div>
          <strong>{lane.label}</strong>
          <span>{lane.fileName}</span>
        </div>
        <div className="timeline-lane-meta">
          <span>{lane.bpm !== null ? `${lane.bpm} BPM` : "BPM unavailable"}</span>
          <small>{formatPlanningSource(lane.bpmSource)}</small>
        </div>
      </div>

      <div className="timeline-lane-body">
        <div className="timeline-waveform" aria-hidden="true">
          {lane.waveformPeaks.length > 0 ? (
            lane.waveformPeaks.map((peak, index) => (
              <span
                key={`${lane.slotId}-peak-${index}`}
                style={{ height: `${Math.max(8, Math.abs(peak) * 100)}%` }}
              />
            ))
          ) : (
            <span className="timeline-waveform-empty">No waveform preview</span>
          )}
        </div>

        <div className="timeline-overlay">
          {lane.phraseRegions.map((region) => (
            <div
              key={`${lane.slotId}-phrase-${region.barIndex}`}
              className="timeline-phrase-region"
              style={{
                left: `${(region.startSeconds / safeDuration) * 100}%`,
                width: `${Math.max(((region.endSeconds - region.startSeconds) / safeDuration) * 100, 1)}%`,
              }}
              title={`${region.label} · ${formatPlanningSource(region.source)}`}
            />
          ))}

          {lane.beatMarkers.map((marker, index) => (
            <span
              key={`${lane.slotId}-beat-${index}`}
              className="timeline-beat-marker"
              style={{ left: `${(marker.displaySeconds / safeDuration) * 100}%` }}
              title={`Beat at ${marker.timeSeconds.toFixed(2)}s`}
            />
          ))}
        </div>
      </div>

      <div className="timeline-lane-footer">
        <span>{lane.phraseReadiness}</span>
        {lane.alignmentOffsetSeconds !== null ? (
          <span>Alignment offset: {lane.alignmentOffsetSeconds}s (DJ override)</span>
        ) : null}
        {!lane.hasBeatData ? (
          <span className="timeline-unavailable">Beat markers unavailable — analyze track or set DJ overrides.</span>
        ) : null}
      </div>
    </article>
  );
}
