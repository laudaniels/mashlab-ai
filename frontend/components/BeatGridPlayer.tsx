"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  url: string | null;
  /** Used to draw the grid before a remix waveform exists. */
  fallbackDurationSec?: number;
  gridBpm: number;
  firstDownbeatSec: number;
  beatsPerBar: number;
  anchorSec: number | null;
}

interface GridLine {
  t: number;
  isDownbeat: boolean;
  bar: number;
}

export default function BeatGridPlayer({
  url,
  fallbackDurationSec = 0,
  gridBpm,
  firstDownbeatSec,
  beatsPerBar,
  anchorSec,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    let destroyed = false;
    setReady(false);
    setPlaying(false);

    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (destroyed || !containerRef.current) return;
      const ws = WaveSurfer.create({
        container: containerRef.current,
        height: 110,
        waveColor: "#3a3a52",
        progressColor: "#7c5cff",
        cursorColor: "#21d4fd",
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        url,
      });
      wsRef.current = ws;
      ws.on("ready", () => {
        setReady(true);
        setDuration(ws.getDuration());
      });
      ws.on("timeupdate", (t: number) => setCurrent(t));
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));
    })();

    return () => {
      destroyed = true;
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
    };
  }, [url]);

  const gridDuration = duration > 0 ? duration : fallbackDurationSec;

  // Generate a clean, regular grid from BPM + anchor + beats/bar (warp-free).
  const lines = useMemo<GridLine[]>(() => {
    if (!gridDuration || gridBpm <= 0) return [];
    const beatPeriod = 60 / gridBpm;
    const out: GridLine[] = [];
    // Start at the first downbeat, walk backward to fill the intro, then forward.
    let firstBeatIndex = Math.ceil((0 - firstDownbeatSec) / beatPeriod);
    const maxLines = 2000;
    for (let i = firstBeatIndex; out.length < maxLines; i++) {
      const t = firstDownbeatSec + i * beatPeriod;
      if (t > gridDuration) break;
      if (t < 0) continue;
      const barPos = ((i % beatsPerBar) + beatsPerBar) % beatsPerBar;
      const isDownbeat = barPos === 0;
      const bar = Math.floor(i / beatsPerBar) + 1;
      out.push({ t, isDownbeat, bar });
    }
    return out;
  }, [gridDuration, gridBpm, firstDownbeatSec, beatsPerBar]);

  const pct = (t: number) => (gridDuration > 0 ? (t / gridDuration) * 100 : 0);

  return (
    <div className="grid-waveform">
      <div className="ws-stack">
        <div ref={containerRef} />
        <div className="grid-overlay">
          {lines.map((l, i) => (
            <div
              key={i}
              className={`grid-line ${l.isDownbeat ? "downbeat" : "beat"}`}
              style={{ left: `${pct(l.t)}%` }}
            >
              {l.isDownbeat && <span className="bar-num">{l.bar}</span>}
            </div>
          ))}
          {anchorSec != null && gridDuration > 0 && (
            <div
              className="anchor-line"
              style={{ left: `${pct(anchorSec)}%` }}
              title={`Vocal downbeat @ ${anchorSec.toFixed(2)}s`}
            >
              <span className="anchor-label">VOX</span>
            </div>
          )}
        </div>
      </div>

      <div className="transport">
        <button
          className="icon-btn"
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="time">
          {url ? (
            <>
              {formatTime(current)} / {formatTime(duration)}
            </>
          ) : (
            <>Grid preview · {formatTime(gridDuration)}</>
          )}
        </span>
        <span className="muted" style={{ marginLeft: "auto" }}>
          Grid: {gridBpm > 0 ? `${gridBpm.toFixed(1)} BPM` : "—"} · {beatsPerBar}/bar
        </span>
        {!ready && url && (
          <span className="muted">
            <span className="spinner" />
            loading…
          </span>
        )}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
