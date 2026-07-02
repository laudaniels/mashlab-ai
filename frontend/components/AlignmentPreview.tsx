"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  vocalUrl: string | null;
  beatUrl: string | null;
  shiftS: number;
  vocalRate: number;
  vocalGain: number;
  beatGain: number;
  disabled?: boolean;
}

export default function AlignmentPreview({
  vocalUrl,
  beatUrl,
  shiftS,
  vocalRate,
  vocalGain,
  beatGain,
  disabled,
}: Props) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ vocal: AudioBufferSourceNode; beat: AudioBufferSourceNode } | null>(
    null
  );
  const vocalBuf = useRef<AudioBuffer | null>(null);
  const beatBuf = useRef<AudioBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBuffers = useCallback(async () => {
    if (!vocalUrl || !beatUrl) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const [vRes, bRes] = await Promise.all([
        fetch(vocalUrl),
        fetch(beatUrl),
      ]);
      if (!vRes.ok || !bRes.ok) throw new Error("Could not load stem audio");
      const [vAb, bAb] = await Promise.all([vRes.arrayBuffer(), bRes.arrayBuffer()]);
      vocalBuf.current = await ctx.decodeAudioData(vAb.slice(0));
      beatBuf.current = await ctx.decodeAudioData(bAb.slice(0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview load failed");
    } finally {
      setLoading(false);
    }
  }, [vocalUrl, beatUrl]);

  useEffect(() => {
    vocalBuf.current = null;
    beatBuf.current = null;
    void loadBuffers();
  }, [loadBuffers]);

  function stop() {
    try {
      nodesRef.current?.vocal.stop();
      nodesRef.current?.beat.stop();
    } catch {
      /* already stopped */
    }
    nodesRef.current = null;
    setPlaying(false);
  }

  async function play() {
    if (!vocalBuf.current || !beatBuf.current || disabled) return;
    stop();
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const vGain = ctx.createGain();
    vGain.gain.value = vocalGain;
    vGain.connect(ctx.destination);
    const bGain = ctx.createGain();
    bGain.gain.value = beatGain;
    bGain.connect(ctx.destination);

    const beat = ctx.createBufferSource();
    beat.buffer = beatBuf.current;
    beat.connect(bGain);

    const vocal = ctx.createBufferSource();
    vocal.buffer = vocalBuf.current;
    vocal.playbackRate.value = Math.max(0.5, Math.min(2, vocalRate));
    vocal.connect(vGain);

    const now = ctx.currentTime + 0.05;
    // Match backend _place(): positive shift = vocal starts later.
    if (shiftS >= 0) {
      beat.start(now);
      vocal.start(now + shiftS, 0);
    } else {
      const trim = -shiftS;
      beat.start(now + trim);
      vocal.start(now, trim);
    }

    nodesRef.current = { vocal, beat };
    setPlaying(true);
    const dur =
      Math.max(
        beatBuf.current.duration,
        vocalBuf.current.duration / vocalRate + Math.max(0, shiftS)
      ) + 0.2;
    setTimeout(() => setPlaying(false), dur * 1000);
  }

  useEffect(() => () => stop(), []);

  if (!vocalUrl || !beatUrl) return null;

  return (
    <div className="align-preview">
      <div className="align-preview-head">
        <strong>Live alignment preview</strong>
        <span className="muted">
          Hear vocal + beat together before rendering — nudge controls update this
        </span>
      </div>
      <div className="align-preview-actions">
        <button
          className="btn btn-primary"
          disabled={disabled || loading || !!error}
          onClick={() => (playing ? stop() : void play())}
        >
          {loading ? (
            <>
              <span className="spinner" /> Loading stems…
            </>
          ) : playing ? (
            "■ Stop"
          ) : (
            "▶ Preview mix"
          )}
        </button>
        <span className="muted">
          vocal @ {shiftS >= 0 ? "+" : ""}
          {(shiftS * 1000).toFixed(0)} ms · rate {(vocalRate * 100).toFixed(1)}%
        </span>
      </div>
      {error && <div className="status-line error">{error}</div>}
    </div>
  );
}
