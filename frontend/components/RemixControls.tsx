"use client";

import { useState } from "react";

export interface ControlValues {
  targetBpm: number;
  semitones: number;
  offsetMs: number;
  acapellaGain: number;
  instrumentalGain: number;
  downbeatShift: number;
  snap: "off" | "beat" | "bar";
  acapellaTempoMult: number;
  instrumentalTempoMult: number;
  beatLock: boolean;
  autoPlacement: boolean;
  mixPreset: "off" | "light" | "balanced" | "full";
  sectionStartSec?: number | null;
  sectionDurationSec?: number | null;
}

interface Props {
  values: ControlValues;
  onChange: (values: ControlValues) => void;
  beatsPerBar: number;
  disabled?: boolean;
  onAutoAlign: () => void;
  aligning: boolean;
  alignConfidence: number | null;
  onNextPhrase: () => void;
  canCyclePhrase: boolean;
  onAutoKey: () => void;
}

const GRANULARITIES = [
  { id: "ms1", label: "1 ms" },
  { id: "ms10", label: "10 ms" },
  { id: "q", label: "1/4 beat" },
  { id: "beat", label: "1 beat" },
  { id: "bar", label: "1 bar" },
] as const;

type GranId = (typeof GRANULARITIES)[number]["id"];

export default function RemixControls(props: Props) {
  const {
    values,
    onChange,
    beatsPerBar,
    disabled,
    onAutoAlign,
    aligning,
    alignConfidence,
    onNextPhrase,
    canCyclePhrase,
    onAutoKey,
  } = props;
  const [gran, setGran] = useState<GranId>("q");

  const beatMs = values.targetBpm > 0 ? 60000 / values.targetBpm : 500;
  const offsetInBeats = values.offsetMs / beatMs;

  function set<K extends keyof ControlValues>(key: K, value: ControlValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function granDeltaMs(): number {
    switch (gran) {
      case "ms1":
        return 1;
      case "ms10":
        return 10;
      case "q":
        return beatMs / 4;
      case "beat":
        return beatMs;
      case "bar":
        return beatMs * beatsPerBar;
    }
  }

  function nudge(dir: number) {
    const next = values.offsetMs + dir * granDeltaMs();
    set("offsetMs", Math.round(next * 10) / 10);
  }

  const tempoMults = [0.5, 1, 2];

  const MIX_PRESETS = [
    { v: "off", label: "Raw", hint: "no processing (A/B)" },
    { v: "light", label: "Light", hint: "clean + level" },
    { v: "balanced", label: "Balanced", hint: "+ carve pocket" },
    { v: "full", label: "Full", hint: "auto-producer" },
  ] as const;

  return (
    <div className="controls">
      {/* Manual alignment — primary (Serato / MIK model) */}
      <div className="manual-align-panel">
        <div className="manual-align-head">
          <strong>Manual alignment</strong>
          <span className="muted">
            Match BPM, then nudge the vocal onto the beat grid. Use{" "}
            <strong>Preview mix</strong> below — pros align by ear, not by guess.
          </span>
        </div>

        <div className="control-row align-row">
          <button
            className="btn"
            disabled={disabled}
            onClick={() => set("offsetMs", 0)}
            title="Reset fine offset to 0 ms"
          >
            Reset offset
          </button>
          <button
            className="btn"
            disabled={disabled}
            onClick={() =>
              onChange({ ...values, offsetMs: 0, downbeatShift: 0, snap: "bar" })
            }
            title="Lock vocal downbeat to beat downbeat at the overlay (grid-sync)"
          >
            Snap downbeats
          </button>
          <button
            className="btn btn-primary"
            onClick={onAutoAlign}
            disabled={disabled || aligning}
          >
            {aligning ? (
              <>
                <span className="spinner" />
                Suggest…
              </>
            ) : (
              "Auto-suggest offset"
            )}
          </button>
          {alignConfidence != null && (
            <span className="pill-info">
              suggestion {(alignConfidence * 100).toFixed(0)}% — verify by ear
            </span>
          )}
        </div>

        <div className="control">
          <label>
            <span>Vocal position (fine nudge)</span>
            <span className="val">
              {values.offsetMs > 0 ? "+" : ""}
              {Math.round(values.offsetMs)} ms&nbsp;
              <span className="muted">
                ({offsetInBeats >= 0 ? "+" : ""}
                {offsetInBeats.toFixed(2)} beats)
              </span>
            </span>
          </label>
          <div className="nudge-row">
            <button className="btn nudge" disabled={disabled} onClick={() => nudge(-1)}>
              ◀ nudge
            </button>
            <div className="seg">
              {GRANULARITIES.map((g) => (
                <button
                  key={g.id}
                  className={`seg-btn ${gran === g.id ? "active" : ""}`}
                  onClick={() => setGran(g.id)}
                  disabled={disabled}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <button className="btn nudge" disabled={disabled} onClick={() => nudge(1)}>
              nudge ▶
            </button>
          </div>
        </div>

        <div className="control">
          <label>
            <span>Phrase / bar shift</span>
            <span className="muted"> — whole bars, downbeat stays locked</span>
          </label>
          <div className="nudge-row bar-nudge">
            {([-8, -4, -1, 1, 4, 8] as const).map((bars) => (
              <button
                key={bars}
                className="btn nudge"
                disabled={disabled}
                onClick={() =>
                  set("downbeatShift", values.downbeatShift + bars * beatsPerBar)
                }
              >
                {bars > 0 ? "+" : ""}
                {bars} bar{Math.abs(bars) === 1 ? "" : "s"}
              </button>
            ))}
            <button
              className="btn ghost"
              disabled={disabled}
              onClick={() => set("downbeatShift", 0)}
            >
              reset
            </button>
            <button
              className="btn"
              disabled={disabled || !canCyclePhrase}
              onClick={onNextPhrase}
            >
              Try next phrase
            </button>
          </div>
          <span className="val muted">
            anchor shift: {values.downbeatShift > 0 ? "+" : ""}
            {values.downbeatShift} beats (
            {(values.downbeatShift / beatsPerBar).toFixed(1)} bars)
          </span>
        </div>

        <div className="control">
          <label>
            <span>Placement mode</span>
          </label>
          <div className="seg">
            {([
              { v: false, label: "Manual (you)" },
              { v: true, label: "Auto hook drop" },
            ] as const).map((o) => (
              <button
                key={String(o.v)}
                className={`seg-btn ${values.autoPlacement === o.v ? "active" : ""}`}
                onClick={() => set("autoPlacement", o.v)}
                disabled={disabled}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto mix / master preset */}
      <div className="control">
        <label>
          <span>
            Auto mix &amp; master{" "}
            <span className="muted">
              — carves a vocal pocket, gain-stages, and masters to −14 LUFS
            </span>
          </span>
        </label>
        <div className="seg">
          {MIX_PRESETS.map((p) => (
            <button
              key={p.v}
              className={`seg-btn ${values.mixPreset === p.v ? "active" : ""}`}
              onClick={() => set("mixPreset", p.v)}
              disabled={disabled}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fine beat anchor + snap */}
      <div className="controls-grid">
        <div className="control">
          <label>
            <span>Fine beat shift</span>
            <span className="val">
              {values.downbeatShift > 0 ? "+" : ""}
              {values.downbeatShift} beat
              {Math.abs(values.downbeatShift) === 1 ? "" : "s"}
            </span>
          </label>
          <div className="nudge-row">
            <button
              className="btn nudge"
              disabled={disabled}
              onClick={() => set("downbeatShift", values.downbeatShift - 1)}
            >
              ◀
            </button>
            <button
              className="btn nudge"
              disabled={disabled}
              onClick={() => set("downbeatShift", values.downbeatShift + 1)}
            >
              ▶
            </button>
          </div>
        </div>
        <div className="control">
          <label>
            <span>Snap to grid (render)</span>
          </label>
          <div className="seg">
            {(["off", "beat", "bar"] as const).map((s) => (
              <button
                key={s}
                className={`seg-btn ${values.snap === s ? "active" : ""}`}
                onClick={() => set("snap", s)}
                disabled={disabled}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Beat-lock (elastic warp) */}
      <div className="control">
        <label>
          <span>
            Elastic warp (auto){" "}
            <span className="muted">
              — vocals stay grid-locked with no stretching; warp only kicks in if a
              track&apos;s tempo actually drifts
            </span>
          </span>
        </label>
        <div className="seg">
          {([
            { v: true, label: "On" },
            { v: false, label: "Off" },
          ] as const).map((o) => (
            <button
              key={String(o.v)}
              className={`seg-btn ${values.beatLock === o.v ? "active" : ""}`}
              onClick={() => set("beatLock", o.v)}
              disabled={disabled}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Half / double tempo per track */}
      <div className="controls-grid">
        <div className="control">
          <label>
            <span>Vocal tempo</span>
          </label>
          <div className="seg">
            {tempoMults.map((m) => (
              <button
                key={m}
                className={`seg-btn ${values.acapellaTempoMult === m ? "active" : ""}`}
                onClick={() => set("acapellaTempoMult", m)}
                disabled={disabled}
              >
                {m === 0.5 ? "½×" : m === 2 ? "2×" : "1×"}
              </button>
            ))}
          </div>
        </div>
        <div className="control">
          <label>
            <span>Beat tempo</span>
          </label>
          <div className="seg">
            {tempoMults.map((m) => (
              <button
                key={m}
                className={`seg-btn ${
                  values.instrumentalTempoMult === m ? "active" : ""
                }`}
                onClick={() => set("instrumentalTempoMult", m)}
                disabled={disabled}
              >
                {m === 0.5 ? "½×" : m === 2 ? "2×" : "1×"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tempo + Key */}
      <div className="controls-grid">
        <div className="control">
          <label>
            <span>Target tempo</span>
            <span className="val">{values.targetBpm.toFixed(1)} BPM</span>
          </label>
          <input
            type="range"
            min={60}
            max={180}
            step={0.5}
            value={values.targetBpm}
            disabled={disabled}
            onChange={(e) => set("targetBpm", parseFloat(e.target.value))}
          />
        </div>

        <div className="control">
          <label>
            <span>
              Vocal pitch / key{" "}
              <button
                className="btn ghost tiny"
                disabled={disabled}
                onClick={onAutoKey}
              >
                auto
              </button>
            </span>
            <span className="val">
              {values.semitones > 0 ? "+" : ""}
              {values.semitones} st
            </span>
          </label>
          <input
            type="range"
            min={-6}
            max={6}
            step={1}
            value={values.semitones}
            disabled={disabled}
            onChange={(e) => set("semitones", parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* Volumes */}
      <div className="controls-grid">
        <div className="control">
          <label>
            <span>Vocal volume</span>
            <span className="val">{Math.round(values.acapellaGain * 100)}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={values.acapellaGain}
            disabled={disabled}
            onChange={(e) => set("acapellaGain", parseFloat(e.target.value))}
          />
        </div>
        <div className="control">
          <label>
            <span>Instrumental volume</span>
            <span className="val">
              {Math.round(values.instrumentalGain * 100)}%
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={values.instrumentalGain}
            disabled={disabled}
            onChange={(e) => set("instrumentalGain", parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
