"use client";

import { useEffect, useMemo, useState } from "react";
import UploadCard from "@/components/UploadCard";
import AlignmentPreview from "@/components/AlignmentPreview";
import BeatGridPlayer from "@/components/BeatGridPlayer";
import RemixControls, { ControlValues } from "@/components/RemixControls";
import { computeAlignment } from "@/lib/alignment";
import { absoluteUrl, alignTracks, pollJob, startRemix } from "@/lib/api";
import type { AlignResult, JobResponse, PhraseCandidate, TrackInfo } from "@/lib/types";

function suggestedSemitone(fromIndex: number, toIndex: number): number {
  let diff = ((toIndex - fromIndex) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  return diff;
}

const DEFAULT_CONTROLS: ControlValues = {
  targetBpm: 120,
  semitones: 0,
  offsetMs: 0,
  acapellaGain: 1,
  instrumentalGain: 1,
  downbeatShift: 0,
  snap: "off",
  acapellaTempoMult: 1,
  instrumentalTempoMult: 1,
  beatLock: true,
  autoPlacement: true,
  mixPreset: "full",
  sectionStartSec: null as number | null,
  sectionDurationSec: null as number | null,
};

export default function Home() {
  const [acapella, setAcapella] = useState<TrackInfo | null>(null);
  const [instrumental, setInstrumental] = useState<TrackInfo | null>(null);
  const [controls, setControls] = useState<ControlValues>(DEFAULT_CONTROLS);
  const [initialized, setInitialized] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alignConfidence, setAlignConfidence] = useState<number | null>(null);
  const [phraseCandidates, setPhraseCandidates] = useState<PhraseCandidate[]>([]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [alignBase, setAlignBase] = useState<AlignResult | null>(null);

  const bothReady = Boolean(acapella && instrumental);

  useEffect(() => {
    if (bothReady && !initialized && acapella && instrumental) {
      const effInstrBpm =
        (instrumental.bpm > 0 ? instrumental.bpm : 120) *
        DEFAULT_CONTROLS.instrumentalTempoMult;
      setControls({
        ...DEFAULT_CONTROLS,
        targetBpm: effInstrBpm,
        semitones: suggestedSemitone(acapella.key_index, instrumental.key_index),
      });
      setInitialized(true);
    }
  }, [bothReady, initialized, acapella, instrumental]);

  const resultUrl = useMemo(
    () => (job?.status === "done" && job.resultUrl ? absoluteUrl(job.resultUrl) : null),
    [job]
  );

  const masterBpm = controls.targetBpm;
  const masterFirstDownbeat =
    instrumental?.bar_phase_sec ??
    instrumental?.first_downbeat_sec ??
    instrumental?.downbeat_sec ??
    0;
  const beatsPerBar = instrumental?.beats_per_bar ?? 4;

  const alignment = useMemo(() => {
    if (!acapella || !instrumental) return null;
    return computeAlignment(acapella, instrumental, controls);
  }, [acapella, instrumental, controls]);

  const anchorSec = alignment?.anchorSec ?? null;

  function barDurationMs(): number {
    if (masterBpm <= 0) return 2000;
    return (60000 / masterBpm) * beatsPerBar;
  }

  async function runRemix() {
    if (!acapella || !instrumental) return;
    setProcessing(true);
    setError(null);
    try {
      const started = await startRemix({
        acapellaId: acapella.id,
        instrumentalId: instrumental.id,
        targetBpm: controls.targetBpm,
        semitones: controls.semitones,
        offsetMs: controls.offsetMs,
        acapellaGain: controls.acapellaGain,
        instrumentalGain: controls.instrumentalGain,
        downbeatShift: controls.downbeatShift,
        snap: controls.snap,
        acapellaTempoMult: controls.acapellaTempoMult,
        instrumentalTempoMult: controls.instrumentalTempoMult,
        beatLock: controls.beatLock,
        autoPlacement: controls.autoPlacement,
        remixMode: "clean_blend",
        sectionStartSec: controls.sectionStartSec,
        sectionDurationSec: controls.sectionDurationSec,
        mixPreset: controls.mixPreset,
      });
      const finished = await pollJob(started.jobId);
      if (finished.status === "error") {
        throw new Error(finished.error || "Remix failed on the server");
      }
      setJob(finished);
      if (finished.params) {
        setControls((c) => ({
          ...c,
          targetBpm: finished.params!.target_bpm,
          semitones: finished.params!.semitones,
          offsetMs: finished.params!.offset_ms,
          acapellaGain: finished.params!.acapella_gain,
          instrumentalGain: finished.params!.instrumental_gain,
          downbeatShift: finished.params!.downbeat_shift ?? c.downbeatShift,
          snap: (finished.params!.snap as ControlValues["snap"]) ?? c.snap,
          acapellaTempoMult:
            finished.params!.acapella_tempo_mult ?? c.acapellaTempoMult,
          instrumentalTempoMult:
            finished.params!.instrumental_tempo_mult ?? c.instrumentalTempoMult,
          beatLock: finished.params!.beat_lock ?? c.beatLock,
          autoPlacement: c.autoPlacement,
          mixPreset: (finished.params!.mix_preset as ControlValues["mixPreset"]) ?? c.mixPreset,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setProcessing(false);
    }
  }

  async function handleAutoAlign() {
    if (!acapella || !instrumental) return;
    setAligning(true);
    setError(null);
    try {
      const res = await alignTracks(acapella.id, instrumental.id);
      setAlignBase(res);
      setAlignConfidence(res.offset_confidence);
      const sorted = [...res.phrase_candidates].sort((a, b) => b.score - a.score);
      setPhraseCandidates(sorted);
      setPhraseIndex(0);
      setControls((c) => ({
        ...c,
        offsetMs: res.recommended_offset_ms,
        semitones: res.semitone_shift,
        targetBpm:
          acapella.bpm > 0
            ? acapella.bpm * res.tempo_ratio * c.instrumentalTempoMult
            : c.targetBpm,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-align failed");
    } finally {
      setAligning(false);
    }
  }

  function handleNextPhrase() {
    if (!phraseCandidates.length) return;
    const nextIdx = (phraseIndex + 1) % phraseCandidates.length;
    setPhraseIndex(nextIdx);
    const cand = phraseCandidates[nextIdx];
    const base = alignBase?.recommended_offset_ms ?? controls.offsetMs;
    const barMs = barDurationMs();
    setControls((c) => ({
      ...c,
      offsetMs: Math.round((base + cand.bars * barMs) * 10) / 10,
    }));
    setAlignConfidence(cand.score);
  }

  function handleAutoKey() {
    if (!acapella || !instrumental) return;
    setControls((c) => ({
      ...c,
      semitones: suggestedSemitone(acapella.key_index, instrumental.key_index),
    }));
  }

  const hasResult = job?.status === "done";

  return (
    <main className="container">
      <div className="hero">
        <h1>DJ Remix Studio</h1>
        <p>
          Drop two full songs — we extract vocals and the beat, then Quick Mix
          uses Remix Brain to lock phrase/downbeat anchors automatically.
        </p>
      </div>

      <div className="grid-2">
        <UploadCard
          role="acapella"
          title="Vocals from this song"
          hint="Drop any track — we'll isolate the acapella"
          extractLabel="vocals"
          track={acapella}
          onReset={() => {
            setAcapella(null);
            setInitialized(false);
            setJob(null);
            setAlignBase(null);
            setPhraseCandidates([]);
            setAlignConfidence(null);
          }}
          onUploaded={(t) => {
            setAcapella(t);
            setInitialized(false);
            setJob(null);
            setAlignBase(null);
            setPhraseCandidates([]);
            setAlignConfidence(null);
          }}
        />
        <UploadCard
          role="instrumental"
          title="Beat from this song"
          hint="Drop any track — we'll isolate the instrumental"
          extractLabel="instrumental"
          track={instrumental}
          onReset={() => {
            setInstrumental(null);
            setInitialized(false);
            setJob(null);
            setAlignBase(null);
            setPhraseCandidates([]);
            setAlignConfidence(null);
          }}
          onUploaded={(t) => {
            setInstrumental(t);
            setInitialized(false);
            setJob(null);
            setAlignBase(null);
            setPhraseCandidates([]);
            setAlignConfidence(null);
          }}
        />
      </div>

      <div className="remix-bar">
        <button
          className="btn btn-primary btn-big"
          disabled={!bothReady || processing}
          onClick={runRemix}
        >
          {processing ? (
            <>
              <span className="spinner" />
              Mixing…
            </>
          ) : hasResult ? (
            "Re-render Quick Mix"
          ) : (
            "Quick Mix"
          )}
        </button>
      </div>

      {error && <div className="status-line error">{error}</div>}

      {bothReady && (
        <div className="card" style={{ marginTop: 8 }}>
          <BeatGridPlayer
            url={resultUrl}
            fallbackDurationSec={instrumental?.duration ?? 0}
            gridBpm={masterBpm}
            firstDownbeatSec={masterFirstDownbeat}
            beatsPerBar={beatsPerBar}
            anchorSec={anchorSec}
          />
          {acapella && instrumental && alignment && (
            <AlignmentPreview
              vocalUrl={absoluteUrl(`/api/track/${acapella.id}/audio`)}
              beatUrl={absoluteUrl(`/api/track/${instrumental.id}/audio`)}
              shiftS={alignment.shiftS}
              vocalRate={alignment.rate}
              vocalGain={controls.acapellaGain}
              beatGain={controls.instrumentalGain}
              disabled={processing}
            />
          )}
          <details className="research-note" style={{ marginTop: 16 }}>
            <summary>Advanced alignment (optional nudge)</summary>
            <RemixControls
              values={controls}
              onChange={setControls}
              beatsPerBar={beatsPerBar}
              disabled={processing}
              onAutoAlign={handleAutoAlign}
              aligning={aligning}
              alignConfidence={alignConfidence}
              onNextPhrase={handleNextPhrase}
              canCyclePhrase={phraseCandidates.length > 1}
              onAutoKey={handleAutoKey}
            />
            <p className="muted" style={{ marginTop: 12 }}>
              Remix Brain picks anchors on Quick Mix. Use offset / bar shift only if
              you need a manual override before re-render. Preview uses browser
              playbackRate — render uses Rubber Band.
            </p>
          </details>
        </div>
      )}

      {hasResult && (
        <div className="card" style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Your Remix
            </h2>
            {job?.params && (
              <span className="pill-info">
                <span className={`dot ${job.params.rubberband ? "" : "off"}`} />
                {job.params.warp_applied
                  ? `Elastic warp · drift (${job.params.warp_anchors ?? 0} pts)`
                  : "Grid-synced · downbeat-locked"}
                {job.params.grid
                  ? job.params.grid.tempo_matched
                    ? ` · beats locked`
                    : ` · custom tempo (may drift)`
                  : ""}
                {job.params.grid && job.params.grid.bar_offset
                  ? ` · +${job.params.grid.bar_offset} bars`
                  : ""}
                {" · "}
                {Math.abs(job.params.stretch_rate - 1) > 0.005
                  ? `vocal ${(job.params.stretch_rate * 100).toFixed(1)}% speed`
                  : "no stretch"}
              </span>
            )}
          </div>

          {job?.params?.plan_summary && (
            <div className="plan-card">
              <div className="plan-card-header">
                <h3>Quick Mix result</h3>
                <span
                  className={`confidence-badge confidence-${job.params.confidence_tier ?? job.params.plan_summary.confidence_tier}`}
                >
                  Sync:{" "}
                  {(job.params.confidence_tier ?? job.params.plan_summary.confidence_tier)
                    .charAt(0)
                    .toUpperCase() +
                    (job.params.confidence_tier ?? job.params.plan_summary.confidence_tier).slice(1)}
                </span>
              </div>
              <dl className="plan-details">
                <div>
                  <dt>Remix plan</dt>
                  <dd>{job.params.plan_summary.mode_label}</dd>
                </div>
                <div>
                  <dt>Sync</dt>
                  <dd>{job.params.plan_summary.sync_label}</dd>
                </div>
                <div>
                  <dt>Tempo</dt>
                  <dd>{job.params.plan_summary.tempo_label}</dd>
                </div>
                <div>
                  <dt>Key</dt>
                  <dd>{job.params.plan_summary.key_label}</dd>
                </div>
              </dl>
              {(job.params.plan_summary.warnings.length > 0 ||
                (job.params.validation?.warnings?.length ?? 0) > 0) && (
                <ul className="plan-warnings">
                  {job.params.plan_summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {(job.params.validation?.warnings ?? [])
                    .filter((w) => !job.params!.plan_summary!.warnings.includes(w))
                    .map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                </ul>
              )}
              <details className="plan-technical">
                <summary>Technical</summary>
                {job.params.validation && (
                  <p className="muted">
                    Anchor offset:{" "}
                    {job.params.validation.anchor_offset_ms >= 0 ? "+" : ""}
                    {job.params.validation.anchor_offset_ms.toFixed(0)} ms
                    {job.params.validation.ideal ? " (ideal)" : ""}
                    {!job.params.validation.passed ? " · sync below threshold" : ""}
                  </p>
                )}
                <p className="muted">{job.params.plan_summary.reason_summary}</p>
                <p className="muted">
                  Score {job.params.plan_summary.score.toFixed(0)}/100 · vocal anchor{" "}
                  {job.params.plan_summary.vocal_anchor_type}{" "}
                  {job.params.plan_summary.vocal_anchor_sec.toFixed(2)}s · beat anchor{" "}
                  {job.params.plan_summary.instrumental_anchor_type}{" "}
                  {job.params.plan_summary.instrumental_anchor_sec.toFixed(2)}s
                </p>
                {job.params.plan_summary.score_breakdown && (
                  <ul className="score-breakdown">
                    {Object.entries(job.params.plan_summary.score_breakdown).map(
                      ([k, v]) => (
                        <li key={k}>
                          {k}: {v}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </details>
            </div>
          )}

          {job?.params?.mix && (
            <div className="mix-report">
              <span className="pill-info">
                <span className="dot" />
                {job.params.mix.preset === "off"
                  ? "Raw mix"
                  : `Auto-master · ${job.params.mix.preset}`}
              </span>
              {typeof job.params.mix.out_lufs === "number" && (
                <span className="mix-stat">{job.params.mix.out_lufs.toFixed(1)} LUFS</span>
              )}
              {typeof job.params.mix.true_peak_db === "number" && (
                <span className="mix-stat">
                  {job.params.mix.true_peak_db.toFixed(1)} dBTP
                </span>
              )}
              {job.params.mix.carve_db ? (
                <span className="mix-stat">carve −{job.params.mix.carve_db} dB</span>
              ) : null}
              {typeof job.params.mix.vocal_lead_db === "number" && (
                <span className="mix-stat">
                  vocal +{job.params.mix.vocal_lead_db.toFixed(1)} dB
                </span>
              )}
              {job.params.mix.reverb_wet ? (
                <span className="mix-stat">
                  reverb {(job.params.mix.reverb_wet * 100).toFixed(0)}%
                </span>
              ) : null}
            </div>
          )}

          {job?.resultUrl && (
            <div className="actions">
              {job.wavUrl && (
                <a className="btn btn-primary" href={absoluteUrl(job.wavUrl)} download="remix.wav">
                  Download WAV
                </a>
              )}
              <a
                className="btn"
                href={absoluteUrl(job.resultUrl)}
                download="remix.mp3"
              >
                Download MP3
              </a>
            </div>
          )}
          <p className="muted rights-notice">
            Local use only. You are responsible for rights to any source material you
            upload. This app does not download from streaming services, publish mixes,
            or share files to the cloud.
          </p>
        </div>
      )}
    </main>
  );
}
