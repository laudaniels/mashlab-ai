"use client";

import { useEffect, useRef, useState } from "react";
import { pollTrack, uploadTrack } from "@/lib/api";
import type { Role, TrackInfo } from "@/lib/types";

interface Props {
  role: Role;
  title: string;
  hint: string;
  extractLabel: string;
  track: TrackInfo | null;
  onUploaded: (track: TrackInfo) => void;
  onReset: () => void;
}

const STAGE_TEXT: Record<string, string> = {
  queued: "Queued…",
  separating: "Separating stems (this can take a bit)…",
  analyzing: "Analyzing tempo & key…",
};

export default function UploadCard({
  role,
  title,
  hint,
  extractLabel,
  track,
  onUploaded,
  onReset,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [skipSeparation, setSkipSeparation] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setStage("queued");
    onReset();
    try {
      const ack = await uploadTrack(file, role, skipSeparation);
      const result = await pollTrack(ack.id, (s) => setStage(s));
      if (result.status === "error") {
        throw new Error(result.error || "Processing failed");
      }
      onUploaded({
        id: result.id,
        role: result.role,
        filename: result.filename,
        status: "done",
        separated: result.separated,
        bpm: result.bpm ?? 0,
        key: result.key ?? "—",
        key_index: result.key_index ?? 0,
        mode: result.mode ?? "",
        duration: result.duration ?? 0,
        downbeat_sec: result.downbeat_sec ?? 0,
        peaks: result.peaks ?? [],
        beats_per_bar: result.beats_per_bar ?? 4,
        bpm_confidence: result.bpm_confidence ?? 0,
        tempo_stability: result.tempo_stability ?? 0,
        grid_type: result.grid_type ?? "static",
        first_downbeat_sec: result.first_downbeat_sec ?? result.downbeat_sec ?? 0,
        beat_times: result.beat_times ?? [],
        downbeat_times: result.downbeat_times ?? [],
        grid_source: result.grid_source ?? "librosa",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setStage(undefined);
    }
  }

  return (
    <div className={`card upload-card ${role}`}>
      <div className="role-label">{title}</div>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        {busy ? (
          <span>
            <span className="spinner" />
            {stage ? STAGE_TEXT[stage] ?? "Working…" : "Uploading…"}
            {elapsed > 0 && (
              <span className="muted" style={{ marginLeft: 8 }}>
                {elapsed}s
              </span>
            )}
          </span>
        ) : track ? (
          <div>
            <div className="filename">{track.filename}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {track.separated ? `Extracted ${extractLabel}` : "Used as-is"} ·
              click to replace
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 15, color: "var(--text)" }}>
              Drop a song here
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {hint}
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <label className="skip-toggle">
        <input
          type="checkbox"
          checked={skipSeparation}
          disabled={busy}
          onChange={(e) => setSkipSeparation(e.target.checked)}
        />
        <span>Already isolated — skip separation</span>
      </label>

      {track && (
        <div className="badges">
          <span className="badge">
            <span className="k">BPM</span>
            {track.bpm > 0 ? track.bpm.toFixed(1) : "—"}
          </span>
          <span className="badge">
            <span className="k">Key</span>
            {track.key}
          </span>
          <span className="badge">
            <span className="k">Grid</span>
            {track.beats_per_bar}/bar · {track.grid_source}
          </span>
          <span className="badge">
            <span className="k">Length</span>
            {formatDuration(track.duration)}
          </span>
        </div>
      )}

      {error && (
        <div className="status-line error" style={{ textAlign: "left" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
