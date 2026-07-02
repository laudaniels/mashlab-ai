"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string | null;
}

export default function WaveformPlayer({ url }: Props) {
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
        height: 96,
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

  return (
    <div className="waveform-wrap">
      <div ref={containerRef} />
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
          {formatTime(current)} / {formatTime(duration)}
        </span>
        {!ready && url && (
          <span className="muted">
            <span className="spinner" />
            loading waveform…
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
